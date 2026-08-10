import { expect, test, type APIRequestContext } from "@playwright/test";
import { demoAccounts } from "../fixtures/demo-accounts";

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post("/api/auth/login", { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  const session = await response.json();
  return { Authorization: `Bearer ${session.access_token}` };
}

test.describe("dashboard integration flows", () => {
  for (const [role, account] of Object.entries(demoAccounts)) {
    test(`${role} login loads its authorized dashboard`, async ({ request }) => {
      const headers = await signIn(request, account.email, account.password);
      const dashboard = await request.get(account.dashboard, { headers });

      expect(dashboard.ok()).toBeTruthy();
    });
  }

  test("student todo changes persist across create, update, and reload", async ({ request }) => {
    const headers = await signIn(
      request,
      demoAccounts.student.email,
      demoAccounts.student.password,
    );
    const title = `Integration todo ${Date.now()}`;
    const created = await request.post("/api/student/todos", { data: { title }, headers });
    expect(created.ok()).toBeTruthy();
    const todo = (await created.json()).todo as { id: number; title: string; completed: boolean };
    expect(todo).toMatchObject({ title, completed: false });

    const completed = await request.patch(`/api/student/todos/${todo.id}`, {
      data: { completed: true },
      headers,
    });
    expect(completed.ok()).toBeTruthy();
    expect((await completed.json()).todo.completed).toBe(true);

    const dashboard = await request.get("/api/student/dashboard", { headers });
    expect((await dashboard.json()).student_todos).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: todo.id, completed: true })]),
    );

    const deleted = await request.delete(`/api/student/todos/${todo.id}`, { headers });
    expect(deleted.ok()).toBeTruthy();
  });

  test("unauthenticated dashboard requests are rejected", async ({ request }) => {
    const response = await request.get("/api/admin/dashboard");
    expect(response.status()).toBe(401);
  });
});
