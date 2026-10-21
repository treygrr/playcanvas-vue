const types: Record<string, string> = {
    json: 'application/json',
    js: 'text/javascript',
    mjs: 'text/javascript',
    wasm: 'application/wasm',
    css: 'text/css',
    html: 'text/html',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    ktx2: 'image/ktx2',
    basis: 'application/octet-stream',
    hdr: 'image/vnd.radiance',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    bin: 'application/octet-stream',
    ply: 'application/octet-stream',
    sog: 'application/octet-stream',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2'
};

/**
 * The content type for a file path, by extension.
 */
export const contentType = (path: string): string =>
    types[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
