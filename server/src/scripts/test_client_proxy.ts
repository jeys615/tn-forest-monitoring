async function testClientProxy(): Promise<void> {
  console.log('Testing login request via Client Vite Dev Server Proxy (http://localhost:5173/api/auth/login)...');
  try {
    const res = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tnforest.gov.in', password: 'Admin@TNFMS2026!' }),
    });
    interface ProxyLoginData {
      success: boolean;
      data?: {
        user?: { email: string; role: string };
        token?: string;
      };
    }
    const data = (await res.json()) as ProxyLoginData;
    console.log(`  • Client Proxy HTTP Status : ${res.status}`);
    console.log(`  • Login Success            : ${data.success}`);
    console.log(`  • Authenticated User Email : ${data.data?.user?.email}`);
    console.log(`  • Authenticated User Role  : ${data.data?.user?.role}`);
    console.log(`  • Token Issued             : ${!!data.data?.token}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Client proxy request failed:', msg);
  }
  process.exit(0);
}

testClientProxy();
