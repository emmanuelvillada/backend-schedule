**Repository Overview**

- **Type:** NestJS backend (starter) using TypeScript.
- **Key files:** [package.json](package.json), [src/main.ts](src/main.ts#L1-L20), [src/app.module.ts](src/app.module.ts#L1-L40), [src/app.controller.ts](src/app.controller.ts#L1-L40), [src/app.service.ts](src/app.service.ts#L1-L40).

**What this agent should know (big picture)**

- The app is a minimal NestJS service: `main.ts` bootstraps `AppModule`, which wires controllers and providers.
- Routing and request handlers live in `controllers` (currently `AppController`). Business logic lives in `providers`/`services` (e.g., `AppService`).
- The project uses Prisma as a dependency (see `package.json`), so changes interacting with data may require updating Prisma schema and running `prisma` commands.

**Developer workflows / commands**

- Install: `npm install` (see [README.md](README.md)).
- Build: `npm run build` (runs `nest build`).
- Run (dev): `npm run start:dev` (hot-reload), production: `npm run start:prod`.
- Tests: unit `npm run test`, e2e `npm run test:e2e`, coverage `npm run test:cov`.
- Lint/format: `npm run lint`, `npm run format`.

**Project-specific patterns & conventions**

- Follow standard NestJS layering: controllers delegate to services; modules group related controllers/providers (see [src/app.module.ts](src/app.module.ts#L1-L40)).
- Use `class-validator` + `class-transformer` for DTO validation if adding APIs — those libraries are present in `package.json`.
- Authentication-related packages (`passport`, `passport-jwt`, `bcrypt`) are present; expect auth code to live in an `auth/` module if added.
- Prisma client is included: keep DB access encapsulated in a repository or service layer rather than inside controllers.

**Testing notes**

- Jest is configured in `package.json` with `ts-jest`. Unit tests live next to code using `*.spec.ts` under `src/`.
- e2e config file: [test/jest-e2e.json](test/jest-e2e.json). Use `npm run test:e2e` to run end-to-end tests.

**Integration & runtime details**

- The HTTP port is read from `process.env.PORT` in [src/main.ts](src/main.ts#L1-L20). Tests or containers should set `PORT` explicitly when necessary.
- When adding background jobs, prefer creating separate providers and registering them in a dedicated module.

**What to avoid / common pitfalls**

- Do not alter `main.ts` bootstrap flow unless adding global middleware or adapting app lifecycle — prefer module-level changes.
- If you change Prisma models, run `npx prisma generate` and apply migrations as appropriate; tests may need a test DB or in-memory setup.

**How to propose code changes (PR guidance for AI agents)**

- Keep edits minimal and focused per PR: e.g., add a controller, or add a service + tests.
- Include or update script commands in `package.json` only when the change requires new dev steps.

**Examples (concise)**

- Add a new route: create `src/my.module.ts` registering `MyController` and `MyService`, then export the service from the module.
- Run e2e: `npm run build && npm run start:prod` in one terminal, then `npm run test:e2e` in another (or mock external integrations).

If anything here is unclear or you want more detail (for example, DB test setup, expected Prisma schema location, or auth module patterns), tell me which area to expand.
