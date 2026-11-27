// Shared glTF codec defaults for Three.js r180 GLTFLoader:
//   - EXT_meshopt_compression via MeshoptDecoder (works in both browser and Node.js tests)
//   - KHR_texture_basisu via KTX2Loader (transcodes UASTC KTX2 to native ASTC/ETC2/BC7 in browser;
//     falls back to a lightweight 1x1 DataTexture stub in headless Node.js unit tests)
import { DataTexture, RGBAFormat } from './three.module.js';
import { KTX2Loader } from './KTX2Loader.js';
import { MeshoptDecoder } from './meshopt_decoder.module.js';

export const meshoptDecoder = MeshoptDecoder;

const BASIS_PATH = new URL('./basis/', import.meta.url).href;

let browserKtx2 = null;
let detected = false;
let nodeStub = null;

function probeFromOffscreenCanvas(ktx2) {
	if ( typeof document === 'undefined' ) return;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 1;
	const gl = canvas.getContext( 'webgl2' ) || canvas.getContext( 'webgl' );
	if ( ! gl ) {
		ktx2.workerConfig = {
			astcSupported: false, astcHDRSupported: false,
			etc1Supported: false, etc2Supported: false,
			dxtSupported: false, bptcSupported: false, pvrtcSupported: false,
		};
		return;
	}
	const astc = gl.getExtension( 'WEBGL_compressed_texture_astc' );
	ktx2.workerConfig = {
		astcSupported: Boolean( astc ),
		astcHDRSupported: Boolean( astc && astc.getSupportedProfiles?.().includes( 'hdr' ) ),
		etc1Supported: Boolean( gl.getExtension( 'WEBGL_compressed_texture_etc1' ) ),
		etc2Supported: Boolean( gl.getExtension( 'WEBGL_compressed_texture_etc' ) ),
		dxtSupported: Boolean( gl.getExtension( 'WEBGL_compressed_texture_s3tc' ) ),
		bptcSupported: Boolean( gl.getExtension( 'EXT_texture_compression_bptc' ) ),
		pvrtcSupported: Boolean( gl.getExtension( 'WEBGL_compressed_texture_pvrtc' ) || gl.getExtension( 'WEBKIT_WEBGL_compressed_texture_pvrtc' ) ),
	};
	gl.getExtension( 'WEBGL_lose_context' )?.loseContext();
}

function ensureDetected( ktx2 ) {
	if ( ! detected && ! ktx2.workerConfig ) {
		probeFromOffscreenCanvas( ktx2 );
		detected = true;
	}
}

function ensureBrowserKtx2() {
	if ( ! browserKtx2 ) {
		browserKtx2 = new KTX2Loader();
		browserKtx2.setTranscoderPath( BASIS_PATH );
		browserKtx2.setWorkerLimit( 2 );
		const rawLoad = browserKtx2.load.bind( browserKtx2 );
		browserKtx2.load = ( url, onLoad, onProgress, onError ) => {
			ensureDetected( browserKtx2 );
			return rawLoad( url, onLoad, onProgress, onError );
		};
		const rawParse = browserKtx2.parse.bind( browserKtx2 );
		browserKtx2.parse = ( buffer, onLoad, onError ) => {
			ensureDetected( browserKtx2 );
			return rawParse( buffer, onLoad, onError );
		};
	}
	return browserKtx2;
}

/** Register the live WebGLRenderer so KTX2Loader uses its real hardware format capabilities without probing a second context. */
export function initKTX2Renderer( renderer ) {
	if ( ! renderer || typeof window === 'undefined' ) return null;
	const ktx2 = ensureBrowserKtx2();
	if ( ! detected && renderer.extensions ) {
		ktx2.detectSupport( renderer );
		detected = true;
	}
	return ktx2;
}

/** Default KTX2Loader instance for GLTFLoader (real GPU transcoder in browser, lightweight stub in Node.js tests). */
export function getDefaultKTX2Loader() {
	if ( typeof window === 'undefined' || typeof document === 'undefined' ) {
		const stubTex = () => {
			const tex = new DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1, RGBAFormat );
			tex.needsUpdate = true;
			return tex;
		};
		return ( nodeStub ??= {
			load( _url, onLoad ) {
				const tex = stubTex();
				onLoad?.( tex );
				return tex;
			},
			parse( _buffer, onLoad ) {
				const tex = stubTex();
				onLoad?.( tex );
				return Promise.resolve( tex );
			},
			dispose() {},
		} );
	}
	return ensureBrowserKtx2();
}
