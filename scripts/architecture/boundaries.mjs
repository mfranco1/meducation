import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const isTest = (file) => file.startsWith('src/test/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
const uiPackage = /^(react(?:-dom)?(?:\/|$)|@mui\/|@emotion\/)/;
const browserLayers = /^(app|features|shared|qa)(\/|$)/;

export function importProblem(from, target, typeOnly = false) {
  if (!from.startsWith('src/')) return;
  const source = from.slice(4);
  const destination = target.startsWith('src/') ? target.slice(4) : undefined;
  if (!isTest(from) && (isTest(target) || target.startsWith('tests/') || target.startsWith('e2e/')))
    return 'Production code cannot import test code or fixtures.';
  if (target.startsWith('scripts/')) return 'Application code cannot import maintenance tools.';
  if (/^(domain|analytics|persistence|content|admin\/(core|data))\//.test(source) && uiPackage.test(target))
    return 'This layer cannot depend on React or UI libraries.';
  if (!destination) return;
  if (isTest(from) && destination.startsWith('test/')) return;
  if (source.startsWith('domain/') && !destination.startsWith('domain/'))
    return 'Domain code can depend only on domain modules.';
  if (source.startsWith('analytics/') && !/^(domain|analytics)\//.test(destination))
    return 'Analytics can depend only on domain and analytics modules.';
  if (source.startsWith('persistence/') && !/^(domain|persistence)\//.test(destination))
    return 'Persistence can depend only on domain and persistence modules.';
  if (source.startsWith('content/') && !/^(domain|content)\//.test(destination)) {
    // This existing contract test compares the Python revision with authoring serialization.
    if (from === 'src/content/validation/bankContract.test.ts' && target === 'src/admin/core/serializeBank.ts') return;
    return 'Content cannot depend on application, presentation, or storage implementations.';
  }
  if (source.startsWith('shared/') && !/^(domain|analytics|content|shared)\//.test(destination))
    return 'Shared presentation cannot depend on composition, features, admin, QA, or storage.';
  if (source.startsWith('features/')) {
    if (/^(app|admin|qa)\//.test(destination)) return 'Features cannot depend on app, admin, or QA.';
    if (destination.startsWith('features/') && source.split('/')[1] !== destination.split('/')[1])
      return 'Features cannot import sibling features.';
    if (!/^(features|domain|analytics|content|shared|persistence)\//.test(destination))
      return 'Features use their own modules and documented lower-level contracts.';
    if (!isTest(from) && destination.startsWith('persistence/') && !typeOnly && !source.includes('/session/'))
      return 'Only feature sessions may use concrete persistence; presentation/selectors use contracts.';
  }
  if (
    /^admin\/(core|data)\//.test(source) &&
    (browserLayers.test(destination) ||
      (destination.startsWith('admin/') && !/^admin\/(core|data)\//.test(destination)))
  )
    return 'Admin core/data cannot depend on presentation.';
}

export function createResolver(root) {
  const optionsFor = (name) => {
    const configPath = path.join(root, name);
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    return ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  };
  const app = optionsFor('tsconfig.app.json');
  const node = optionsFor('tsconfig.node.json');
  const cache = ts.createModuleResolutionCache(root, (file) => file);
  return (from, specifier) => {
    const options = from.startsWith('scripts/') ? node : app;
    const relative = specifier.startsWith('.') || specifier.startsWith('/');
    const name = relative ? specifier.replace(/[?#].*$/, '') : specifier;
    const resolved = ts.resolveModuleName(name, path.resolve(root, from), options, ts.sys, cache).resolvedModule;
    const file =
      resolved?.resolvedFileName ??
      (relative && fs.existsSync(path.resolve(root, path.dirname(from), name))
        ? path.resolve(root, path.dirname(from), name)
        : undefined);
    if (file && !file.split(path.sep).includes('node_modules')) {
      const target = path.relative(root, file).split(path.sep).join('/');
      return target.startsWith('../') ? { problem: 'Imports must stay inside this repository.' } : { target };
    }
    const alias = Object.keys(options.paths ?? {}).some((pattern) => {
      const [prefix, suffix = ''] = pattern.split('*');
      return pattern.includes('*') ? name.startsWith(prefix) && name.endsWith(suffix) : name === pattern;
    });
    if (relative || alias || name.startsWith('#')) return { problem: `Cannot resolve repository import ${specifier}.` };
    return { target: specifier };
  };
}

export function moduleImports(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  const add = (node, literal, typeOnly = false, dynamic = false) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    imports.push({
      line,
      typeOnly,
      dynamic,
      specifier: literal && ts.isStringLiteralLike(literal) ? literal.text : undefined,
    });
  };
  const allTypes = (elements) => elements?.length > 0 && elements.every((element) => element.isTypeOnly);
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      add(
        node,
        node.moduleSpecifier,
        Boolean(
          clause?.isTypeOnly ||
          (!clause?.name &&
            clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            allTypes(clause.namedBindings.elements)),
        ),
      );
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(
        node,
        node.moduleSpecifier,
        Boolean(
          node.isTypeOnly ||
          (node.exportClause && ts.isNamedExports(node.exportClause) && allTypes(node.exportClause.elements)),
        ),
      );
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, true);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression, node.isTypeOnly);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node, node.arguments[0], false, node.expression.kind === ts.SyntaxKind.ImportKeyword);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

export function findCycles(edges) {
  const active = new Set();
  const done = new Set();
  const stack = [];
  const cycles = [];
  const visit = (file) => {
    if (active.has(file)) {
      cycles.push([...stack.slice(stack.indexOf(file)), file]);
      return;
    }
    if (done.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const target of edges.get(file) ?? []) visit(target);
    stack.pop();
    active.delete(file);
    done.add(file);
  };
  for (const file of edges.keys()) visit(file);
  return cycles;
}

export function reachableFrom(edges, roots) {
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const target of edges.get(file) ?? []) visit(target);
  };
  roots.forEach(visit);
  return visited;
}
