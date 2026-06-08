import { THREE } from "@opentui/core/3d";

export interface RingData {
	mesh: THREE.Line;
	material: THREE.LineBasicMaterial;
	speed: number;
	axis: THREE.Vector3;
	phase: number;
	wobblePhase: number;
}

export interface FragmentData {
	mesh: THREE.Mesh;
	material: THREE.MeshBasicMaterial;
	orbitRadius: number;
	orbitSpeed: number;
	orbitAngle: number;
	bobSpeed: number;
	bobPhase: number;
}

export interface SceneElements {
	mainAnchor: THREE.Group;
	coreGroup: THREE.Group;
	orbitGroup: THREE.Group;
	fragmentGroup: THREE.Group;
	coreMesh: THREE.Mesh;
	glowMesh: THREE.Mesh;
	glowMat: THREE.MeshBasicMaterial;
	glowPos: THREE.BufferAttribute;
	glowBasePositions: Float32Array;
	eye: THREE.Mesh;
	eyeMat: THREE.MeshBasicMaterial;
	pupil: THREE.Mesh;
	pupilMat: THREE.MeshBasicMaterial;
	rings: RingData[];
	fragments: FragmentData[];
	sigilLines: THREE.LineSegments;
	sigilMat: THREE.LineBasicMaterial;
	sigilPos: THREE.BufferAttribute;
	pointLight: THREE.PointLight;
}

type TrackGeometry = <T extends THREE.BufferGeometry>(g: T) => T;
type TrackMaterial = <T extends THREE.Material>(m: T) => T;

export function createSceneElements(
	scene: THREE.Scene,
	trackGeo: TrackGeometry,
	trackMat: TrackMaterial
): SceneElements {
	const mainAnchor = new THREE.Group();
	scene.add(mainAnchor);

	const coreGroup = new THREE.Group();
	mainAnchor.add(coreGroup);

	const orbitGroup = new THREE.Group();
	mainAnchor.add(orbitGroup);

	const fragmentGroup = new THREE.Group();
	mainAnchor.add(fragmentGroup);

	// Core mesh and glow
	const coreGeo = trackGeo(new THREE.IcosahedronGeometry(0.35, 0));
	const coreMat = trackMat(
		new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: 0.95,
		})
	);
	const coreMesh = new THREE.Mesh(coreGeo, coreMat);
	coreGroup.add(coreMesh);

	const glowGeo = trackGeo(new THREE.IcosahedronGeometry(0.38, 1));
	const glowMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0x666666,
			wireframe: true,
			transparent: true,
			opacity: 0.6,
			blending: THREE.AdditiveBlending,
		})
	);
	const glowMesh = new THREE.Mesh(glowGeo, glowMat);
	const glowPos = glowGeo.attributes.position as THREE.BufferAttribute;
	const glowBasePositions = new Float32Array(glowPos.array as ArrayLike<number>);
	coreGroup.add(glowMesh);

	// Eye and pupil
	const eyeGeo = trackGeo(new THREE.RingGeometry(0.08, 0.16, 6));
	const eyeMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 1.0,
			blending: THREE.AdditiveBlending,
		})
	);
	const eye = new THREE.Mesh(eyeGeo, eyeMat);
	eye.position.set(0, 0, 0.36);
	coreGroup.add(eye);

	const pupilGeo = trackGeo(new THREE.CircleGeometry(0.06, 6));
	const pupilMat = trackMat<THREE.MeshBasicMaterial>(
		new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 1.0,
			blending: THREE.AdditiveBlending,
		})
	);
	const pupil = new THREE.Mesh(pupilGeo, pupilMat);
	pupil.position.set(0, 0, 0.37);
	coreGroup.add(pupil);

	// Orbiting rings
	const rings: RingData[] = [];
	for (let i = 0; i < 3; i++) {
		const radius = 0.7 + i * 0.25;
		const segments = 32;
		const points: THREE.Vector3[] = [];
		for (let j = 0; j <= segments; j++) {
			const theta = (j / segments) * Math.PI * 2;
			if (j % 8 < 6 || i === 1) {
				points.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
			}
		}

		const geo = trackGeo(new THREE.BufferGeometry().setFromPoints(points));
		const mat = trackMat<THREE.LineBasicMaterial>(
			new THREE.LineBasicMaterial({
				color: 0x888888,
				transparent: true,
				opacity: 0.5 + i * 0.15,
				blending: THREE.AdditiveBlending,
			})
		);

		const ring = new THREE.Line(geo, mat);
		ring.rotation.x = (i * Math.PI) / 3 + Math.random() * 0.3;
		ring.rotation.y = (i * Math.PI) / 4;

		rings.push({
			mesh: ring,
			material: mat,
			speed: 0.3 + i * 0.15,
			axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
			phase: Math.random() * Math.PI * 2,
			wobblePhase: Math.random() * Math.PI * 2,
		});
		orbitGroup.add(ring);
	}

	// Floating fragments
	const fragments: FragmentData[] = [];
	const fragmentCount = 12;
	for (let i = 0; i < fragmentCount; i++) {
		let geo: THREE.BufferGeometry;
		const shapeType = i % 4;
		const size = 0.08 + Math.random() * 0.06;

		switch (shapeType) {
			case 0:
				geo = trackGeo(new THREE.TetrahedronGeometry(size));
				break;
			case 1:
				geo = trackGeo(new THREE.OctahedronGeometry(size));
				break;
			case 2:
				geo = trackGeo(new THREE.BoxGeometry(size, size * 0.3, size * 0.3));
				break;
			default:
				geo = trackGeo(new THREE.IcosahedronGeometry(size * 0.7, 0));
		}

		const mat = trackMat<THREE.MeshBasicMaterial>(
			new THREE.MeshBasicMaterial({
				color: 0x666666,
				wireframe: Math.random() > 0.5,
				transparent: true,
				opacity: 0.6 + Math.random() * 0.3,
				blending: THREE.AdditiveBlending,
			})
		);

		const mesh = new THREE.Mesh(geo, mat);
		const orbitRadius = 1.6;
		const orbitOffset = (i / fragmentCount) * Math.PI * 2;
		mesh.position.set(
			Math.cos(orbitOffset) * orbitRadius,
			(Math.random() - 0.5) * 0.4,
			Math.sin(orbitOffset) * orbitRadius
		);
		mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

		fragments.push({
			mesh,
			material: mat,
			orbitRadius,
			orbitSpeed: 0.4,
			orbitAngle: orbitOffset,
			bobSpeed: 1 + Math.random() * 1.5,
			bobPhase: Math.random() * Math.PI * 2,
		});
		fragmentGroup.add(mesh);
	}

	// Sigil lines connecting fragments
	const sigilGeo = trackGeo(new THREE.BufferGeometry());
	const sigilPositions = new Float32Array(fragmentCount * 2 * 3);
	sigilGeo.setAttribute("position", new THREE.BufferAttribute(sigilPositions, 3));

	const sigilMat = trackMat<THREE.LineBasicMaterial>(
		new THREE.LineBasicMaterial({
			color: 0x444444,
			transparent: true,
			opacity: 0.3,
			blending: THREE.AdditiveBlending,
		})
	);
	const sigilLines = new THREE.LineSegments(sigilGeo, sigilMat);
	scene.add(sigilLines);
	const sigilPos = sigilLines.geometry.attributes.position as THREE.BufferAttribute;

	// Central light
	const pointLight = new THREE.PointLight(0xffffff, 0.8, 6);
	pointLight.position.set(0, 0, 0.5);
	coreGroup.add(pointLight);

	return {
		mainAnchor,
		coreGroup,
		orbitGroup,
		fragmentGroup,
		coreMesh,
		glowMesh,
		glowMat,
		glowPos,
		glowBasePositions,
		eye,
		eyeMat,
		pupil,
		pupilMat,
		rings,
		fragments,
		sigilLines,
		sigilMat,
		sigilPos,
		pointLight,
	};
}
