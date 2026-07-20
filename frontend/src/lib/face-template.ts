type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserFaceDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ boundingBox: FaceBox }>>;
};

type BrowserFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => BrowserFaceDetector;

const TEMPLATE_SIZE = 48;
const DETECTION_MAX_WIDTH = 224;
const DEFAULT_CAPTURE_DELAY_MS = 20;

let faceDetectorSingleton: BrowserFaceDetector | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Camera stream is unavailable"));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("error", handleError);
    };
    video.addEventListener("loadeddata", handleReady, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function squareRect(box: FaceBox, frameWidth: number, frameHeight: number): FaceBox {
  const size = Math.max(box.width, box.height) * 1.35;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const x = clamp(centerX - size / 2, 0, Math.max(0, frameWidth - size));
  const y = clamp(centerY - size / 2, 0, Math.max(0, frameHeight - size));
  return {
    x,
    y,
    width: Math.min(size, frameWidth),
    height: Math.min(size, frameHeight),
  };
}

function centeredFaceRect(frameWidth: number, frameHeight: number): FaceBox {
  const size = Math.min(frameWidth, frameHeight) * 0.72;
  return {
    x: (frameWidth - size) / 2,
    y: Math.max(0, (frameHeight - size) / 2 - frameHeight * 0.05),
    width: size,
    height: size,
  };
}

async function detectFaceBox(source: HTMLCanvasElement): Promise<{ box: FaceBox; detector: string }> {
  const faceDetectorCtor = (window as Window & { FaceDetector?: BrowserFaceDetectorConstructor }).FaceDetector;
  if (faceDetectorCtor) {
    try {
      if (!faceDetectorSingleton) {
        faceDetectorSingleton = new faceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
      }
      const scale = source.width > DETECTION_MAX_WIDTH ? DETECTION_MAX_WIDTH / source.width : 1;
      const detectionWidth = Math.max(1, Math.round(source.width * scale));
      const detectionHeight = Math.max(1, Math.round(source.height * scale));
      const detectionCanvas = createCanvas(detectionWidth, detectionHeight);
      const detectionContext = detectionCanvas.getContext("2d");
      if (!detectionContext) throw new Error("Could not create the face detection canvas");
      detectionContext.drawImage(source, 0, 0, detectionWidth, detectionHeight);

      const faces = await faceDetectorSingleton.detect(detectionCanvas);
      if (faces[0]?.boundingBox) {
        const detected = faces[0].boundingBox;
        const mapped = {
          x: detected.x / scale,
          y: detected.y / scale,
          width: detected.width / scale,
          height: detected.height / scale,
        };
        return {
          box: squareRect(mapped, source.width, source.height),
          detector: "shape-detection",
        };
      }
    } catch {
      // Fall through to the centered crop if the browser detector fails.
    }
  }

  return {
    box: centeredFaceRect(source.width, source.height),
    detector: "center-crop",
  };
}

function grayscalePixels(data: Uint8ClampedArray) {
  const pixels = new Float32Array(data.length / 4);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < data.length; sourceIndex += 4, targetIndex += 1) {
    pixels[targetIndex] = data[sourceIndex] * 0.299 + data[sourceIndex + 1] * 0.587 + data[sourceIndex + 2] * 0.114;
  }
  return pixels;
}

function normalizeVector(values: number[]) {
  const length = Math.sqrt(values.reduce((total, value) => total + value * value, 0));
  if (!length) return values.map(() => 0);
  return values.map((value) => Number((value / length).toFixed(8)));
}

function blockMeans(gray: Float32Array, width: number, height: number) {
  const rows = 8;
  const cols = 8;
  const blockHeight = Math.floor(height / rows);
  const blockWidth = Math.floor(width / cols);
  const features: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let total = 0;
      let samples = 0;
      const startY = row * blockHeight;
      const endY = row === rows - 1 ? height : startY + blockHeight;
      const startX = col * blockWidth;
      const endX = col === cols - 1 ? width : startX + blockWidth;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          total += gray[y * width + x];
          samples += 1;
        }
      }
      features.push(samples ? total / samples / 255 : 0);
    }
  }

  return normalizeVector(features);
}

function lbpHistogram(gray: Float32Array, width: number, height: number) {
  const cellRows = 4;
  const cellCols = 4;
  const bins = 16;
  const cellHeight = Math.floor(height / cellRows);
  const cellWidth = Math.floor(width / cellCols);
  const features: number[] = [];

  for (let row = 0; row < cellRows; row += 1) {
    for (let col = 0; col < cellCols; col += 1) {
      const histogram = new Array<number>(bins).fill(0);
      let samples = 0;
      const startY = Math.max(1, row * cellHeight);
      const endY = Math.min(height - 1, row === cellRows - 1 ? height - 1 : startY + cellHeight);
      const startX = Math.max(1, col * cellWidth);
      const endX = Math.min(width - 1, col === cellCols - 1 ? width - 1 : startX + cellWidth);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = y * width + x;
          const center = gray[index];
          let code = 0;
          if (gray[index - width - 1] >= center) code |= 1;
          if (gray[index - width] >= center) code |= 2;
          if (gray[index - width + 1] >= center) code |= 4;
          if (gray[index + 1] >= center) code |= 8;
          if (gray[index + width + 1] >= center) code |= 16;
          if (gray[index + width] >= center) code |= 32;
          if (gray[index + width - 1] >= center) code |= 64;
          if (gray[index - 1] >= center) code |= 128;
          histogram[code >> 4] += 1;
          samples += 1;
        }
      }

      const normalizedCell = histogram.map((value) => (samples ? value / samples : 0));
      features.push(...normalizedCell);
    }
  }

  return normalizeVector(features);
}

function brightnessVariance(gray: Float32Array) {
  const mean = gray.reduce((total, value) => total + value, 0) / gray.length;
  const variance = gray.reduce((total, value) => total + (value - mean) ** 2, 0) / gray.length;
  return variance;
}

function buildTemplateFromImageData(imageData: ImageData) {
  const gray = grayscalePixels(imageData.data);
  const variance = brightnessVariance(gray);
  if (variance < 110) {
    throw new Error("Face is too dark or blurred. Move closer to the camera and try again.");
  }

  const texture = lbpHistogram(gray, imageData.width, imageData.height);
  const structure = blockMeans(gray, imageData.width, imageData.height);
  return normalizeVector([...texture, ...structure]);
}

async function captureDescriptor(video: HTMLVideoElement, preferredBox?: FaceBox) {
  await waitForVideo(video);
  const frameCanvas = createCanvas(video.videoWidth, video.videoHeight);
  const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
  if (!frameContext) throw new Error("Could not read the webcam frame");

  frameContext.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
  const detection = preferredBox
    ? { box: preferredBox, detector: "cached-box" }
    : await detectFaceBox(frameCanvas);
  const { box, detector } = detection;

  const cropCanvas = createCanvas(TEMPLATE_SIZE, TEMPLATE_SIZE);
  const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
  if (!cropContext) throw new Error("Could not prepare the face crop");

  cropContext.drawImage(
    frameCanvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    TEMPLATE_SIZE,
    TEMPLATE_SIZE,
  );

  const imageData = cropContext.getImageData(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
  return {
    template: buildTemplateFromImageData(imageData),
    detector,
    box,
  };
}

export async function captureFaceTemplate(video: HTMLVideoElement, frames = 3) {
  const samples: number[][] = [];
  const detectors = new Set<string>();
  let activeBox: FaceBox | undefined;

  for (let index = 0; index < frames; index += 1) {
    const result = await captureDescriptor(video, activeBox);
    samples.push(result.template);
    detectors.add(result.detector);
    activeBox = result.box;
    if (index < frames - 1) {
      await sleep(DEFAULT_CAPTURE_DELAY_MS);
    }
  }

  if (!samples.length) {
    throw new Error("No face scan could be captured from the webcam");
  }

  const averaged = samples[0].map((_, featureIndex) => {
    const sum = samples.reduce((total, sample) => total + sample[featureIndex], 0);
    return sum / samples.length;
  });

  return {
    template: normalizeVector(averaged),
    framesCaptured: samples.length,
    detector: Array.from(detectors).join(", "),
  };
}
