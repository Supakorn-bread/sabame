import { afterEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { DatabaseModule } from "../src/database/database.module.js";
import { DatabaseService } from "../src/database/prisma.service.js";
import { MalRepository } from "../src/database/repository.js";
import { CatalogModule } from "../src/modules/catalog/catalog.module.js";
import { CatalogService } from "../src/modules/catalog/catalog.service.js";
import { MalModule } from "../src/modules/mal/mal.module.js";
import { MalService } from "../src/modules/mal/mal.service.js";

describe("feature module boundaries and dependency injection", () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
    vi.unstubAllEnvs();
  });

  it("keeps catalog providers isolated from persistence and MAL", async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    const catalogModule = moduleRef.select(CatalogModule);
    expect(catalogModule.get(CatalogService, { strict: true })).toBeInstanceOf(
      CatalogService,
    );
    expect(() => catalogModule.get(MalRepository, { strict: true })).toThrow();
    expect(() => catalogModule.get(MalService, { strict: true })).toThrow();
  });

  it("injects an overridden repository into the MAL service without connecting PostgreSQL", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const user = { id: 73, name: "di-viewer" };
    const repository = {
      session: vi.fn().mockResolvedValue(user),
      exclusive: vi.fn(
        async (_userId: number, operation: () => Promise<unknown>) =>
          operation(),
      ),
      account: vi.fn().mockResolvedValue({
        user,
        tokens: "encrypted",
        expiresAt: Date.now(),
        imported: true,
        lastSyncedAt: null,
        revision: 0,
      }),
      entryPage: vi.fn().mockResolvedValue([]),
      operationPage: vi.fn().mockResolvedValue([]),
    };
    moduleRef = await Test.createTestingModule({ imports: [MalModule] })
      .overrideProvider(MalRepository)
      .useValue(repository)
      .compile();

    const service = moduleRef.get(MalService);
    const response = await service.list(
      new Request("http://localhost/api/mal/list", {
        headers: { cookie: "sabame_mal_session=di-session" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user,
      imported: true,
      items: [],
      operations: [],
    });
    expect(repository.session).toHaveBeenCalledWith("di-session");
    expect(repository.account).toHaveBeenCalledWith(user.id);
    expect(repository.entryPage).toHaveBeenCalledOnce();
    expect(repository.operationPage).toHaveBeenCalledOnce();
  });

  it("resolves the repository lazily through an overridden DatabaseService and runs its shutdown hook", async () => {
    const user = { id: 84, name: "database-override" };
    const client = {
      session: {
        findFirst: vi.fn().mockResolvedValue({ account: { profile: user } }),
      },
    };
    const database = {
      getClient: vi.fn().mockResolvedValue(client),
      onApplicationShutdown: vi.fn(),
    };

    moduleRef = await Test.createTestingModule({ imports: [DatabaseModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    const repository = moduleRef.get(MalRepository);
    expect(database.getClient).not.toHaveBeenCalled();
    await expect(repository.session("override-session")).resolves.toEqual(user);
    expect(database.getClient).toHaveBeenCalledOnce();
    expect(client.session.findFirst).toHaveBeenCalledOnce();

    const closingModule = moduleRef;
    moduleRef = undefined;
    await closingModule.close();
    expect(database.onApplicationShutdown).toHaveBeenCalledOnce();
  });
});
