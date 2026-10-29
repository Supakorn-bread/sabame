export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.RENDER === "true"
    && process.env.RENDER_GIT_BRANCH === "test/render-thai-provider"
    && process.env.THAI_PROVIDER_DIAGNOSTICS === "1") {
    const { diagnoseThaiProviders } = await import("./features/media/server/thai-provider-diagnostics");
    await diagnoseThaiProviders();
  }
}
