// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./features/media/server/thai-provider-diagnostics", () => ({ diagnoseThaiProviders: vi.fn() }));
import { diagnoseThaiProviders } from "./features/media/server/thai-provider-diagnostics";
import { register } from "./instrumentation";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Render Thai diagnostic startup gate", () => {
  it.each(["NEXT_RUNTIME", "RENDER", "RENDER_GIT_BRANCH", "THAI_PROVIDER_DIAGNOSTICS"])("does not run without %s", async (missing) => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_GIT_BRANCH", "test/render-thai-provider");
    vi.stubEnv("THAI_PROVIDER_DIAGNOSTICS", "1");
    vi.stubEnv(missing, "");
    await register();
    expect(diagnoseThaiProviders).not.toHaveBeenCalled();
  });
  it("runs only when explicitly enabled on the Render test branch", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_GIT_BRANCH", "test/render-thai-provider");
    vi.stubEnv("THAI_PROVIDER_DIAGNOSTICS", "1");
    await register();
    expect(diagnoseThaiProviders).toHaveBeenCalledOnce();
  });
});
