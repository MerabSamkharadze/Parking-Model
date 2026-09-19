// Builds the reduced-detail car models in public/models/lod from the full
// ones: normals are dropped so the flat-shaded seams weld, the mesh is
// simplified (meshoptimizer, error 1 % of the extent keeps the silhouette;
// roughly halves the triangles, mostly wheel segments) and written uncompressed.
// The scene recomputes flat normals when it bakes the geometry (carModels.ts).
//
// Not a project dependency — run from a scratch folder:
//   npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer
//   node lod.mjs ../public/models/sedan.glb ../public/models/lod/sedan.glb 0.3 0.01
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, weld, prune, dedup } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [,, input, output, ratioArg = '0.3', errorArg = '0.01'] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
let before = 0, after = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  before += prim.getIndices() ? prim.getIndices().getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
  const n = prim.getAttribute('NORMAL'); if (n) { prim.setAttribute('NORMAL', null); }
}
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratioArg, error: +errorArg, lockBorder: false }), dedup(), prune());
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) after += prim.getIndices().getCount() / 3;
// drop the meshopt extension so the file is plain (the loader handles both)
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
await io.write(output, doc);
console.log(`${input}: ${before} → ${after} tris`);
