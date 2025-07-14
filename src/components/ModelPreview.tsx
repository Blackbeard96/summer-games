   import React, { useMemo } from 'react';
   import { Canvas } from '@react-three/fiber';
   import { OrbitControls } from '@react-three/drei';
   import { useLoader } from '@react-three/fiber';
   import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
   import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';

   interface ModelPreviewProps {
     file: File;
   }

   function STLModel({ url }: { url: string }) {
     const geometry = useLoader(STLLoader, url);
     return (
       <mesh geometry={geometry}>
         <meshStandardMaterial color="orange" />
       </mesh>
     );
   }

   function OBJModel({ url }: { url: string }) {
     const obj = useLoader(OBJLoader, url);
     return <primitive object={obj} />;
   }

   const ModelPreview: React.FC<ModelPreviewProps> = ({ file }) => {
     const url = useMemo(() => URL.createObjectURL(file), [file]);
     const ext = file.name.split('.').pop()?.toLowerCase();

     if (ext !== 'stl' && ext !== 'obj') {
       return <div>Unsupported file type</div>;
     }

     return (
       <div style={{ width: '100%', height: 300, marginTop: 16, background: '#222', borderRadius: 8 }}>
         <Canvas camera={{ position: [0, 0, 50], fov: 45 }}>
           <ambientLight intensity={0.7} />
           <pointLight position={[10, 10, 10]} />
           {ext === 'stl' ? <STLModel url={url} /> : <OBJModel url={url} />}
           <OrbitControls />
         </Canvas>
       </div>
     );
   };

   export default ModelPreview;