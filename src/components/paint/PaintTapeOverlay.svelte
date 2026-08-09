<script lang="ts">
	import type { TapeSegment } from "./paint.helpers.js";

	interface TapeStripeColors {
		light: string;
		dark: string;
	}

	interface Props {
		segments: TapeSegment[];
		cellPx: number;
		widthPx: number;
		heightPx: number;
		offsetXPx: number;
		offsetYPx: number;
		guideIndex?: number | null;
		palette?: readonly TapeStripeColors[];
	}

	const DEFAULT_PALETTE = [
		{ light: "#9bdcf7", dark: "#3f9dcc" },
		{ light: "#8fe0d6", dark: "#2f9f95" },
		{ light: "#b7b1f4", dark: "#7468c9" },
		{ light: "#91c8f4", dark: "#467fb8" },
		{ light: "#b2d7ea", dark: "#648fa7" },
		{ light: "#9fd1c5", dark: "#4f8f82" }
	] as const satisfies readonly TapeStripeColors[];

	let {
		segments,
		cellPx,
		widthPx,
		heightPx,
		offsetXPx,
		offsetYPx,
		guideIndex = null,
		palette = DEFAULT_PALETTE
	}: Props = $props();

	const availableColors = $derived(palette.length ? palette : DEFAULT_PALETTE);
	const guiding = $derived(
		guideIndex !== null && guideIndex >= 0 && guideIndex < segments.length
	);
	const activeGuideIndex = $derived(
		guiding && guideIndex !== null ? guideIndex : -1
	);
	const styledSegments = $derived.by(() => {
		let horizontal = 0;
		let vertical = 0;

		return segments.map((segment) => {
			const order =
				segment.orientation === "horizontal" ? ++horizontal : ++vertical;
			const colorOffset = segment.orientation === "horizontal" ? 0 : 3;

			return {
				segment,
				colors:
					availableColors[(order - 1 + colorOffset) % availableColors.length]
			};
		});
	});

	function segmentStyle(
		segment: TapeSegment,
		colors: TapeStripeColors,
		stackOrder: number,
		isCurrent: boolean
	): string {
		const zIndex = isCurrent ? segments.length + 1 : stackOrder + 1;
		return `left:${segment.x * cellPx}px;top:${segment.y * cellPx}px;width:${segment.width * cellPx}px;height:${segment.height * cellPx}px;--tape-light:${colors.light};--tape-dark:${colors.dark};z-index:${zIndex}`;
	}
</script>

<div
	class="tape-clip"
	style="width:{widthPx}px; height:{heightPx}px"
	aria-hidden="true"
>
	<div class="tape-layer" style="left:{offsetXPx}px; top:{offsetYPx}px">
		{#each styledSegments as item, index}
			{@const isCurrent = index === activeGuideIndex}
			<span
				class="tape-strip {item.segment.orientation}"
				class:overlap={item.segment.overlapCells.length > 0}
				class:tape-current={isCurrent}
				class:tape-past={guiding && index < activeGuideIndex}
				class:tape-future={guiding && index > activeGuideIndex}
				style={segmentStyle(item.segment, item.colors, index, isCurrent)}
				data-tape-index={index}
				data-orientation={item.segment.orientation}
			></span>
		{/each}
	</div>
</div>

<style>
	.tape-clip {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		overflow: hidden;
		pointer-events: none;
		z-index: 3;
	}

	.tape-layer,
	.tape-strip {
		position: absolute;
	}

	.tape-strip {
		--tape-angle: 135deg;
		box-sizing: border-box;
		background: repeating-linear-gradient(
			var(--tape-angle),
			var(--tape-light) 0 5px,
			var(--tape-dark) 5px 10px
		);
		border: 1px solid #000;
	}

	.tape-strip.vertical {
		--tape-angle: 45deg;
	}

	.tape-strip.overlap {
		--tape-light: rgba(255, 98, 95, 0.95);
		--tape-dark: rgba(158, 39, 46, 0.95);
	}

	.tape-strip.tape-past {
		opacity: 0.18;
	}

	.tape-strip.tape-future {
		opacity: 0;
	}

	.tape-strip.tape-current {
		opacity: 1;
		box-shadow:
			0 0 0 2px gold,
			0 0 10px rgba(255, 215, 0, 0.7);
	}
</style>
