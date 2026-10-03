import { it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function sources(dir: string): string[] { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && e.name !== 'dist' ? sources(join(dir, e.name)) : e.isFile() && /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []); }
it('pure simulation has no renderer, runtime clock, network or host imports', () => {
  for (const path of sources('packages/simulation/src')) {
    const source = readFileSync(path, 'utf8');
    expect(source, path).not.toMatch(/Math\.random|Date\.now|performance\.now|setInterval|setTimeout|\bfetch\s*\(|XMLHttpRequest/);
    expect(source, path).not.toMatch(/from\s+['"][^'"]*(react|electron|pixi|zustand|node:|\/ui\/|\/desktop\/)/);
  }
});
it('presentation imports only read DTOs, shared helpers and application port', () => {
  for (const dir of ['packages/ui/src', 'apps/desktop/src']) {
    let paths: string[] = []; try { paths = sources(dir); } catch { continue; }
    for (const path of paths) expect(readFileSync(path, 'utf8'), path).not.toMatch(/from\s+['"][^'"]*(\/simulation\/|\/persistence\/|\/replay\/)|WorldState|truthRef/);
  }
});
