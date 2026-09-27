import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const inside = (file, folder) => file === folder || file.startsWith(`${folder}/`);

function targetPath(source, filename) {
  if (source.startsWith(".")) return path.relative(root, path.resolve(path.dirname(filename), source)).replaceAll("\\", "/");
  if (source.startsWith("@/")) return `apps/web/src/${source.slice(2)}`;
  const workspace = source.match(/^@sabame\/(web|api|domain|catalog)(?:\/(.*))?$/);
  if (!workspace) return source;
  const [, name, suffix = ""] = workspace;
  return `${["web", "api"].includes(name) ? "apps" : "packages"}/${name}/${suffix}`;
}

export const workspaceBoundaries = {
  meta: { type: "problem", schema: [], messages: { boundary: "{{reason}}" } },
  create(context) {
    const filename = context.filename;
    const owner = path.relative(root, filename).replaceAll("\\", "/");
    const client = context.sourceCode.ast.body.some((node) => node.type === "ExpressionStatement" && node.directive === "use client");
    function check(node, source) {
      if (typeof source !== "string") return;
      const target = targetPath(source, filename);
      let reason;
      if (inside(owner, "apps/web") && (inside(target, "apps/api") || /^(?:@nestjs\/|@prisma\/|pg$)/.test(source))) {
        reason = "The web app calls the API over HTTP; it cannot import backend or database code.";
      } else if (inside(owner, "apps/api") && (inside(target, "apps/web") || /^(?:next(?:\/|$)|react(?:-dom)?(?:\/|$))/.test(source))) {
        reason = "The API cannot depend on frontend code or frameworks.";
      } else if (inside(owner, "packages") && inside(target, "apps")) {
        reason = "Shared packages cannot depend on application internals.";
      } else if (inside(owner, "packages/domain") && !inside(target, "packages/domain")) {
        reason = "Domain contracts must remain pure and dependency-free.";
      } else if (client && (inside(target, "packages/catalog") || target.includes("/server/"))) {
        reason = "Client components cannot import server-only catalog or server modules.";
      }
      if (reason) context.report({ node, messageId: "boundary", data: { reason } });
    }
    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node, node.source.value),
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => check(node, node.source.value),
      CallExpression: (node) => {
        if (node.callee.type === "Identifier" && node.callee.name === "require") check(node, node.arguments[0]?.value);
      },
    };
  },
};

export const boundariesConfig = {
  plugins: { workspace: { rules: { boundaries: workspaceBoundaries } } },
  rules: { "workspace/boundaries": "error" },
};
