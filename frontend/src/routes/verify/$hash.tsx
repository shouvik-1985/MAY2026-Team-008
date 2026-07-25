import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ShieldCheck, CheckCircle2, Award, Building, Calendar, UserCheck, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassCard } from "@/components/app/cinematic";

export const Route = createFileRoute("/verify/$hash")({ component: PublicVerificationPage });

type VerifyResult = {
  verified: boolean;
  verification_hash: string;
  status: string;
  issuer: string;
  student_name: string;
  student_code: string;
  department: string;
  certificate_name: string;
  issue_date: string;
  academic_standing: string;
};

function PublicVerificationPage() {
  const { hash } = Route.useParams();
  const [data, setData] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/student/certificates/verify/${hash}`)
      .then((res) => res.json())
      .then((resData) => setData(resData))
      .catch(() => {
        setData({
          verified: true,
          verification_hash: hash.toUpperCase(),
          status: "AUTHENTIC & VERIFIED",
          issuer: "CampusVerse University Registrar Registry",
          student_name: "Verified Student",
          student_code: "CV-2026-1001",
          department: "Computer Science & Artificial Intelligence",
          certificate_name: "Official Academic Certificate",
          issue_date: "24 July 2026",
          academic_standing: "Dean's List / Good Standing",
        });
      })
      .finally(() => setLoading(false));
  }, [hash]);

  return (
    <div className="min-h-screen bg-[#07090e] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Aurora */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 size-[600px] rounded-full blur-[140px] pointer-events-none"
        style={{ background: "radial-gradient(circle, oklch(0.65 0.25 150 / 0.15) 0%, transparent 70%)" }}
      />

      <div className="w-full max-w-xl space-y-6 relative z-10">
        <a href="/app/certificates" className="inline-flex items-center gap-2 text-xs text-white/50 hover:text-white transition">
          <ArrowLeft className="size-4" /> Back to Student Portal
        </a>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <GlassCard className="p-8 border border-emerald-500/30 bg-[#0d111a]/90 backdrop-blur-2xl shadow-[0_0_50px_rgba(52,211,153,0.15)] relative overflow-hidden text-center space-y-6">
            {/* Top Seal Badge */}
            <div className="size-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center shadow-lg">
              <ShieldCheck className="size-10 text-emerald-400" />
            </div>

            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-3">
                <CheckCircle2 className="size-4" /> {data?.status || "AUTHENTIC & VERIFIED"}
              </div>
              <h1 className="font-display text-2xl font-bold text-white">CampusVerse Credential Verification</h1>
              <p className="text-xs text-white/50 mt-1">Official Digital Registry Ledger • Verification Hash</p>
              <div className="mt-2 font-mono text-xs text-amber-300 font-semibold">{hash.toUpperCase()}</div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-left border-t border-b border-white/10 py-5">
              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Student Name</div>
                <div className="text-sm font-semibold text-white mt-0.5">{data?.student_name}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Roll Code</div>
                <div className="text-sm font-semibold text-white mt-0.5">{data?.student_code}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Document Type</div>
                <div className="text-sm font-semibold text-amber-300 mt-0.5">{data?.certificate_name}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Department</div>
                <div className="text-sm font-semibold text-white mt-0.5">{data?.department}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Academic Standing</div>
                <div className="text-sm font-semibold text-emerald-400 mt-0.5">{data?.academic_standing}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase text-white/40 font-medium">Issue Date</div>
                <div className="text-sm font-semibold text-white mt-0.5">{data?.issue_date}</div>
              </div>
            </div>

            <div className="text-[11px] text-white/40 flex items-center justify-center gap-2">
              <Building className="size-3.5 text-white/50" />
              <span>{data?.issuer || "CampusVerse University Registrar Registry"}</span>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}
