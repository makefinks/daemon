export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export function lerpColor(current: number, target: number, t: number): number {
	const cr = (current >> 16) & 0xff;
	const cg = (current >> 8) & 0xff;
	const cb = current & 0xff;
	const tr = (target >> 16) & 0xff;
	const tg = (target >> 8) & 0xff;
	const tb = target & 0xff;
	return (
		(Math.round(cr + (tr - cr) * t) << 16) |
		(Math.round(cg + (tg - cg) * t) << 8) |
		Math.round(cb + (tb - cb) * t)
	);
}
