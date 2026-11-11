import { describe, it, expect } from 'vitest';
import { parseSymbols } from './parser.js';
import { chunkFile } from './chunker.js';

describe('packages/indexer', () => {
  it('parses JS/TS functions, classes, and calls accurately', () => {
    const code = `
      import { hashPassword } from './crypto.js';

      export async function registerUser(email: string, pass: string) {
        const hash = hashPassword(pass);
        const user = saveUserToDb(email, hash);
        return user;
      }

      export class AuthService {
        verifySession(token: string) {
          return checkToken(token);
        }
      }
    `;

    const symbols = parseSymbols('src/auth.ts', code);
    expect(symbols.length).toBeGreaterThanOrEqual(2);

    const func = symbols.find(s => s.name === 'registerUser');
    expect(func).toBeDefined();
    expect(func?.kind).toBe('function');
    expect(func?.calls).toContain('hashPassword');

    const cls = symbols.find(s => s.name === 'AuthService');
    expect(cls).toBeDefined();
    expect(cls?.kind).toBe('class');
  });

  it('parses Python functions and classes', () => {
    const pyCode = `
class UserManager:
    def get_user(self, user_id):
        return db.fetch(user_id)

def calculate_tax(amount):
    return amount * 0.18
    `;

    const symbols = parseSymbols('services/user.py', pyCode);
    expect(symbols.length).toBeGreaterThanOrEqual(1);
    expect(symbols.some(s => s.name === 'UserManager' || s.name === 'calculate_tax')).toBe(true);
  });

  it('chunks files and prefixes embedding header with location and symbol name', () => {
    const code = `
      export function quickSum(a: number, b: number) {
        return a + b;
      }
    `;

    const { chunks } = chunkFile('repo-1', 'src/math.ts', code, 'sha-1');
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain('File: src/math.ts');
    expect(chunks[0].content).toContain('Symbol: quickSum');
    expect(chunks[0].contentHash).toBeDefined();
  });
});
