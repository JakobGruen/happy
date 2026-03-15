import { describe, it, expect } from 'vitest';
import { languageFromPath } from '../languageFromPath';

describe('languageFromPath', () => {
    describe('JavaScript family', () => {
        it('maps .js, .mjs, .cjs, .jsx to javascript', () => {
            expect(languageFromPath('app.js')).toBe('javascript');
            expect(languageFromPath('utils.mjs')).toBe('javascript');
            expect(languageFromPath('config.cjs')).toBe('javascript');
            expect(languageFromPath('Component.jsx')).toBe('javascript');
        });
    });

    describe('TypeScript family', () => {
        it('maps .ts, .mts, .cts, .tsx to typescript', () => {
            expect(languageFromPath('index.ts')).toBe('typescript');
            expect(languageFromPath('server.mts')).toBe('typescript');
            expect(languageFromPath('require.cts')).toBe('typescript');
            expect(languageFromPath('App.tsx')).toBe('typescript');
        });
    });

    describe('Python', () => {
        it('maps .py and .pyi to python', () => {
            expect(languageFromPath('main.py')).toBe('python');
            expect(languageFromPath('types.pyi')).toBe('python');
        });
    });

    describe('data formats', () => {
        it('maps .json to json', () => {
            expect(languageFromPath('package.json')).toBe('json');
        });

        it('maps .yaml and .yml to yaml', () => {
            expect(languageFromPath('config.yaml')).toBe('yaml');
            expect(languageFromPath('docker-compose.yml')).toBe('yaml');
        });

        it('maps .toml to toml', () => {
            expect(languageFromPath('pyproject.toml')).toBe('toml');
        });

        it('maps .xml and .svg to xml', () => {
            expect(languageFromPath('pom.xml')).toBe('xml');
            expect(languageFromPath('icon.svg')).toBe('xml');
        });
    });

    describe('web languages', () => {
        it('maps .html and .htm to html', () => {
            expect(languageFromPath('index.html')).toBe('html');
            expect(languageFromPath('page.htm')).toBe('html');
        });

        it('maps .css, .scss, .less to css', () => {
            expect(languageFromPath('styles.css')).toBe('css');
            expect(languageFromPath('app.scss')).toBe('css');
            expect(languageFromPath('theme.less')).toBe('css');
        });
    });

    describe('shell', () => {
        it('maps .sh, .bash, .zsh to shell', () => {
            expect(languageFromPath('deploy.sh')).toBe('shell');
            expect(languageFromPath('init.bash')).toBe('shell');
            expect(languageFromPath('config.zsh')).toBe('shell');
        });

        it('maps .env to shell', () => {
            expect(languageFromPath('.env')).toBe('shell');
        });
    });

    describe('systems languages', () => {
        it('maps .go to go', () => {
            expect(languageFromPath('main.go')).toBe('go');
        });

        it('maps .rs to rust', () => {
            expect(languageFromPath('lib.rs')).toBe('rust');
        });

        it('maps .c and .h to c', () => {
            expect(languageFromPath('main.c')).toBe('c');
            expect(languageFromPath('header.h')).toBe('c');
        });

        it('maps .cpp, .cc, .hpp to cpp', () => {
            expect(languageFromPath('main.cpp')).toBe('cpp');
            expect(languageFromPath('util.cc')).toBe('cpp');
            expect(languageFromPath('types.hpp')).toBe('cpp');
        });

        it('maps .swift to swift', () => {
            expect(languageFromPath('App.swift')).toBe('swift');
        });

        it('maps .kt and .kts to kotlin', () => {
            expect(languageFromPath('Main.kt')).toBe('kotlin');
            expect(languageFromPath('build.gradle.kts')).toBe('kotlin');
        });

        it('maps .java to java', () => {
            expect(languageFromPath('Main.java')).toBe('java');
        });

        it('maps .zig to zig', () => {
            expect(languageFromPath('build.zig')).toBe('zig');
        });
    });

    describe('other languages', () => {
        it('maps .rb to ruby', () => {
            expect(languageFromPath('app.rb')).toBe('ruby');
        });

        it('maps .php to php', () => {
            expect(languageFromPath('index.php')).toBe('php');
        });

        it('maps .sql to sql', () => {
            expect(languageFromPath('migration.sql')).toBe('sql');
        });

        it('maps .md and .mdx to markdown', () => {
            expect(languageFromPath('README.md')).toBe('markdown');
            expect(languageFromPath('docs.mdx')).toBe('markdown');
        });

        it('maps .prisma to prisma', () => {
            expect(languageFromPath('schema.prisma')).toBe('prisma');
        });

        it('maps .graphql and .gql to graphql', () => {
            expect(languageFromPath('schema.graphql')).toBe('graphql');
            expect(languageFromPath('query.gql')).toBe('graphql');
        });

        it('maps .jl to julia', () => {
            expect(languageFromPath('simulation.jl')).toBe('julia');
        });

        it('maps .lua to lua', () => {
            expect(languageFromPath('init.lua')).toBe('lua');
        });

        it('maps .r and .R to r', () => {
            expect(languageFromPath('analysis.r')).toBe('r');
            expect(languageFromPath('stats.R')).toBe('r');
        });

        it('maps .ex and .exs to elixir', () => {
            expect(languageFromPath('router.ex')).toBe('elixir');
            expect(languageFromPath('test_helper.exs')).toBe('elixir');
        });
    });

    describe('name-based detection', () => {
        it('maps Dockerfile to dockerfile', () => {
            expect(languageFromPath('Dockerfile')).toBe('dockerfile');
        });

        it('maps Dockerfile.server and similar to dockerfile', () => {
            expect(languageFromPath('Dockerfile.server')).toBe('dockerfile');
            expect(languageFromPath('Dockerfile.webapp')).toBe('dockerfile');
        });

        it('maps Dockerfile in a path to dockerfile', () => {
            expect(languageFromPath('/home/user/project/Dockerfile')).toBe('dockerfile');
            expect(languageFromPath('packages/server/Dockerfile.dev')).toBe('dockerfile');
        });

        it('maps Makefile to makefile', () => {
            expect(languageFromPath('Makefile')).toBe('makefile');
        });

        it('maps Makefile in a path to makefile', () => {
            expect(languageFromPath('/usr/src/Makefile')).toBe('makefile');
        });
    });

    describe('case insensitivity', () => {
        it('handles uppercase extensions', () => {
            expect(languageFromPath('README.MD')).toBe('markdown');
            expect(languageFromPath('styles.CSS')).toBe('css');
            expect(languageFromPath('data.JSON')).toBe('json');
        });

        it('handles mixed-case extensions', () => {
            expect(languageFromPath('file.Ts')).toBe('typescript');
            expect(languageFromPath('file.Py')).toBe('python');
        });
    });

    describe('full paths', () => {
        it('extracts extension from full file paths', () => {
            expect(languageFromPath('/home/user/project/src/index.ts')).toBe('typescript');
            expect(languageFromPath('packages/happy-cli/src/main.ts')).toBe('typescript');
            expect(languageFromPath('C:\\Users\\dev\\app.js')).toBe('javascript');
        });
    });

    describe('edge cases', () => {
        it('returns null for unknown extensions', () => {
            expect(languageFromPath('file.xyz')).toBeNull();
            expect(languageFromPath('data.bin')).toBeNull();
            expect(languageFromPath('image.png')).toBeNull();
        });

        it('returns null for files without extensions', () => {
            expect(languageFromPath('LICENSE')).toBeNull();
            expect(languageFromPath('README')).toBeNull();
        });

        it('returns null for empty string', () => {
            expect(languageFromPath('')).toBeNull();
        });

        it('handles dotfiles without known extensions', () => {
            expect(languageFromPath('.gitignore')).toBeNull();
        });

        it('handles files with multiple dots', () => {
            expect(languageFromPath('build.gradle.kts')).toBe('kotlin');
            expect(languageFromPath('docker-compose.override.yml')).toBe('yaml');
        });
    });
});
