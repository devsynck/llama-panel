/**
 * Build script to create a standalone llama-panel.exe
 *
 * Uses esbuild to bundle all dependencies into a single file,
 * then Node.js SEA (Single Executable Application) to create the .exe
 *
 * Requirements: Node.js 20+
 * Usage: node build.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, 'dist');
const BUNDLE_FILE = path.join(BUILD_DIR, 'bundle.cjs');
const SEA_CONFIG = path.join(BUILD_DIR, 'sea-config.json');
const SEA_BLOB = path.join(BUILD_DIR, 'sea-prep.blob');
const OUTPUT_EXE = path.join(BUILD_DIR, 'llama-panel.exe');

console.log('🦙 Llama Panel — Build Script\n');

if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

// Step 1: Ensure esbuild is installed
console.log('📦 Step 1: Checking esbuild...');
try {
    require.resolve('esbuild');
} catch (e) {
    execSync('npm install --save-dev esbuild', { cwd: __dirname, stdio: 'inherit' });
}

// Step 2: Use esbuild to bundle server.js + all deps into single file
console.log('📦 Step 2: Bundling with esbuild...');
execSync(
    'npx esbuild server.js --bundle --platform=node --target=node20 --outfile=dist/bundle.cjs --format=cjs',
    { cwd: __dirname, stdio: 'inherit' }
);
console.log('   ✅ Bundle created');

// Step 3: Prepend embedded web assets using globalThis.__EMBEDDED_WEB__
console.log('📦 Step 3: Embedding web assets...');

var webDir = path.join(__dirname, 'web');
var webFiles = {};
fs.readdirSync(webDir).forEach(function (file) {
    webFiles[file] = fs.readFileSync(path.join(webDir, file), 'utf-8');
});

var bundleSrc = fs.readFileSync(BUNDLE_FILE, 'utf-8');
var preamble = '// Embedded web assets for standalone exe\n';
preamble += 'const _origEmit = process.emit; process.emit = function(name, data) { if(name === "warning" && data && data.message && data.message.includes("single-executable applications")) return false; return _origEmit.apply(process, arguments); };\n';
preamble += 'globalThis.__EMBEDDED_WEB__ = ' + JSON.stringify(webFiles) + ';\n\n';
var finalBundle = preamble + bundleSrc;
fs.writeFileSync(BUNDLE_FILE, finalBundle, 'utf-8');
console.log('   ✅ Web assets embedded (' + Math.round(finalBundle.length / 1024) + ' KB total)');

// Step 4: Create SEA config
console.log('📦 Step 4: Creating SEA configuration...');
var seaConfig = {
    main: BUNDLE_FILE,
    output: SEA_BLOB,
    disableExperimentalSEAWarning: true,
    useCodeCache: true,
    useSnapshot: false,
};
fs.writeFileSync(SEA_CONFIG, JSON.stringify(seaConfig, null, 2));

// Step 5: Generate the blob
console.log('🔧 Step 5: Generating SEA blob...');
try {
    execSync('node --experimental-sea-config "' + SEA_CONFIG + '"', { stdio: 'inherit', cwd: __dirname });
    console.log('   ✅ SEA blob generated');
} catch (err) {
    console.error('❌ Failed to generate SEA blob:', err.message);
    console.log('');
    console.log('ℹ️  You can still run: node server.js');
    process.exit(1);
}

// Step 6: Copy node.exe
console.log('📦 Step 6: Creating executable...');
try {
    fs.copyFileSync(process.execPath, OUTPUT_EXE);
    console.log('   ✅ Copied Node.js runtime');
} catch (err) {
    console.error('❌ Failed to copy node.exe:', err.message);
    process.exit(1);
}

// Step 7: Remove signature (optional)
console.log('🔐 Step 7: Removing code signature...');
try {
    execSync('signtool remove /s "' + OUTPUT_EXE + '"', { stdio: 'pipe' });
    console.log('   ✅ Signature removed');
} catch (e) {
    console.log('   ⚠️  signtool not available (OK)');
}

// Step 8: Inject SEA blob with postject
console.log('💉 Step 8: Injecting application...');
try {
    try { require.resolve('postject'); } catch (e) {
        execSync('npm install --save-dev postject', { cwd: __dirname, stdio: 'inherit' });
    }
    execSync(
        'npx postject "' + OUTPUT_EXE + '" NODE_SEA_BLOB "' + SEA_BLOB + '" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
        { stdio: 'inherit', cwd: __dirname }
    );

    var exeSize = (fs.statSync(OUTPUT_EXE).size / 1024 / 1024).toFixed(1);
    console.log('');
    console.log('✅ Build complete!');
    console.log('   📁 Output: ' + OUTPUT_EXE);
    console.log('   🚀 Run:    dist\\llama-panel.exe');
    console.log('   📦 Size:   ' + exeSize + ' MB');
} catch (err) {
    console.error('❌ Injection failed:', err.message);
    console.log('');
    console.log('ℹ️  Alternatives:');
    console.log('   node server.js');
    console.log('   llama-panel.bat');
}
