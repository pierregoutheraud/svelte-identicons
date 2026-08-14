<script lang="ts">
	import { browser } from "$app/environment";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import PaintGrid from "../../components/paint/PaintGrid.svelte";
	import {
		observeElementSize,
		type ElementSize
	} from "../../components/paint/paint-grid.dom.js";
	import { getPaintGridZoomMax } from "../../components/paint/paint-grid.model.js";
	import { onDestroy, tick } from "svelte";
	import {
		buildPalette,
		buildTapePattern,
		colorCells,
		extractGrid,
		generateSeed,
		layoutKey,
		measure,
		parsePaintParams,
		parsePaintSurfaceParams,
		productionShareUrl,
		randomHex,
		round,
		selectPaintColors,
		serializePaintParams,
		tapeEndExtensionCm,
		type PaintParams,
		type PaletteEntry
	} from "../../components/paint/paint.helpers.js";

	interface TapeBatchState {
		selected: number[];
		generated: number[] | null;
		showOverlay: boolean;
	}

	const EMPTY_TAPE_BATCH: TapeBatchState = {
		selected: [],
		generated: null,
		showOverlay: false
	};

	// Must stay $state initialised once from the URL. It must NEVER become
	// $derived(parsePaintParams(page.url.searchParams)): the effect below calls
	// goto() with a URL built from this, so deriving it from the URL turns that
	// effect into an infinite navigation loop.
	let params = $state<PaintParams>(parsePaintParams($page.url.searchParams));
	const initialSurface = parsePaintSurfaceParams($page.url.searchParams);

	let painted = $state<boolean[]>([]);
	// What the user picked. All writes go here; `activePaintId` below is the value
	// actually valid against the current palette.
	let selectedPaintId = $state<string | null>(null);
	// Position in the current color's list of squares. -1 = not started.
	let stepIndex = $state(-1);
	let stepList = $state<HTMLElement | undefined>();
	let preferredCellPx = $state(28);
	let gridPaneSize = $state<ElementSize>({ width: 0, height: 0 });
	let squareCm = $state(initialSurface.squareCm);
	let canvasWidthCm = $state(initialSurface.canvasWidthCm);
	let canvasHeightCm = $state(initialSurface.canvasHeightCm);
	let canvasColor = $state(initialSurface.canvasColor);
	let tapeWidthCm = $state(initialSurface.tapeWidthCm);
	let tapeBatches = $state<Record<string, TapeBatchState>>({});
	// -1 = not started, segment count = placement guide completed.
	let tapeGuideIndex = $state(-1);
	let showGuides = $state(true);
	let showHowTo = $state(false);
	let verifyStatus = $state("");
	let shareStatus = $state<"idle" | "copied" | "error">("idle");
	let shareResetTimer: ReturnType<typeof setTimeout> | undefined;
	const actualTapeWidthCm = $derived(
		Number.isFinite(tapeWidthCm) && tapeWidthCm > 0 ? tapeWidthCm : 0.1
	);
	const tapeEndExtension = $derived(tapeEndExtensionCm(squareCm));

	// Neither is $state: both exist only to remember what the last run did. As
	// $state they would be read and written by their own effect, which is the
	// textbook self-invalidating loop.
	let loadedKey = "";
	let lastUrl = "";

	onDestroy(() => clearTimeout(shareResetTimer));

	// All $derived, not $effect: these are rendered, and effects do not run during
	// SSR, so an effect would ship an empty grid in the server HTML. extractGrid
	// works on the server because it falls back to a stub canvas and the engine
	// fills imageData before it ever asks for a 2d context.
	const extraction = $derived(extractGrid(params));
	const grid = $derived(extraction.grid);
	const cellIds = $derived(extraction.cellIds);
	const engineColors = $derived(extraction.colors);
	const selectedPaints = $derived(selectPaintColors(params));
	const canGenerateCombination = $derived(
		params.colors.length > selectedPaints.length
	);
	const palette = $derived(buildPalette(grid, cellIds));
	const ownedPaints = $derived.by(() => {
		const entriesBySourceIndex = new Map<number, PaletteEntry>();

		for (const entry of palette) {
			if (entry.sourceIndex === null) continue;
			const selectedPaint = selectedPaints[entry.sourceIndex];
			if (selectedPaint) {
				entriesBySourceIndex.set(selectedPaint.sourceIndex, entry);
			}
		}

		return params.colors.map((color, sourceIndex) => ({
			color,
			sourceIndex,
			entry: entriesBySourceIndex.get(sourceIndex)
		}));
	});
	const textPaints = $derived(
		palette.filter((entry) => entry.sourceIndex === null)
	);
	const baseEntry = $derived(palette.find((entry) => entry.isBase));
	const toPaint = $derived(
		palette
			.filter((entry) => !entry.isBase)
			.reduce((acc, entry) => acc + entry.count, 0)
	);
	// The main playground treats every custom color as active. Give it only this
	// pattern's selected combination so its canvas remains identical to paint mode.
	const playgroundHref = $derived(
		`/${serializePaintParams({
			...params,
			numberOfColors: engineColors.length,
			colors: engineColors
		})}`
	);

	const key = $derived(layoutKey(params));

	// Stays an $effect: loadProgress reads localStorage, so a $derived would run
	// on the hydration render and diverge from the server's empty array.
	$effect(() => {
		const nextKey = key;
		// Read before the early return: an effect only depends on what it read on
		// its last run, so a return above a read silently narrows the deps.
		const size = params.width * params.height;

		if (nextKey === loadedKey) {
			return;
		}

		loadedKey = nextKey;
		painted = loadProgress(nextKey, size);
		tapeBatches = {};
		tapeGuideIndex = -1;
	});

	$effect(() => {
		const url = serializePaintParams(params, {
			squareCm,
			canvasWidthCm,
			canvasHeightCm,
			canvasColor,
			tapeWidthCm: actualTapeWidthCm
		});

		// bind:value on the seed input fires this on every keystroke, and goto is
		// an async router operation.
		if (url === lastUrl) {
			return;
		}

		lastUrl = url;
		goto(url, { keepFocus: true, noScroll: true, replaceState: true });
	});

	// Derived rather than corrected after the fact: removing a color slot used to
	// leave `activePaintId` pointing at a slot with no cells, which dimmed the
	// whole grid with nothing selected. There is now no moment at which the
	// selection and the palette disagree, so nothing needs fixing up — and no
	// effect writes state it also reads.
	const activePaintId = $derived(
		selectedPaintId !== null &&
			palette.length &&
			!palette.some((entry) => entry.id === selectedPaintId)
			? null
			: selectedPaintId
	);

	const activeEntry = $derived(
		palette.find((entry) => entry.id === activePaintId)
	);
	// Every color can need a tape and square pass: the generated background is
	// not necessarily the physical base coat.
	const steps = $derived(
		activePaintId ? colorCells(cellIds, params.width, activePaintId) : []
	);
	// The set of grid indexes is a stable identity for a colour even when its hex
	// changes. Layout changes clear the map in the effect above.
	const tapeBatchKey = $derived(steps.map((step) => step.index).join(","));
	const activeTapeBatch = $derived(
		tapeBatchKey
			? (tapeBatches[tapeBatchKey] ?? EMPTY_TAPE_BATCH)
			: EMPTY_TAPE_BATCH
	);
	const selectedTapeCells = $derived(activeTapeBatch.selected);
	const selectedTapeSet = $derived(new Set(selectedTapeCells));
	const generatedTapeCells = $derived(activeTapeBatch.generated ?? []);
	const hasGeneratedTape = $derived(activeTapeBatch.generated !== null);
	const showTape = $derived(hasGeneratedTape && activeTapeBatch.showOverlay);
	const currentStep = $derived(
		stepIndex >= 0 ? (steps[stepIndex] ?? null) : null
	);
	// The grid still lifts the whole row, so you keep your place on the canvas
	// while the ring marks the exact square.
	const focusRow = $derived(currentStep?.row ?? null);
	const focusIndex = $derived(currentStep?.index ?? null);
	const measurements = $derived(
		measure({
			width: params.width,
			height: params.height,
			squareCm,
			canvasWidthCm,
			canvasHeightCm
		})
	);
	const zoomMax = $derived(
		getPaintGridZoomMax({
			containerWidthPx: gridPaneSize.width,
			containerHeightPx: gridPaneSize.height,
			gridWidth: params.width,
			gridHeight: params.height,
			squareCm,
			canvasWidthCm,
			canvasHeightCm,
			reservedWidthPx: showGuides ? 26 : 0,
			reservedHeightPx: showGuides ? 15 : 0
		})
	);
	const zoomMin = $derived(Math.min(8, zoomMax));
	const cellPx = $derived(Math.min(preferredCellPx, zoomMax));
	const tapePattern = $derived(
		activeEntry &&
			measurements.fits &&
			hasGeneratedTape &&
			generatedTapeCells.length
			? buildTapePattern({
					grid: cellIds,
					width: params.width,
					height: params.height,
					targetColor: activeEntry.id,
					targetCells: generatedTapeCells,
					squareCm,
					canvasWidthCm,
					canvasHeightCm,
					tapeWidthCm: actualTapeWidthCm
				})
			: {
					segments: [],
					totalLengthCm: 0,
					overlapCells: []
				}
	);
	const currentTape = $derived(
		tapeGuideIndex >= 0 && tapeGuideIndex < tapePattern.segments.length
			? tapePattern.segments[tapeGuideIndex]
			: null
	);
	const tapeGuideComplete = $derived(
		tapePattern.segments.length > 0 &&
			tapeGuideIndex >= tapePattern.segments.length
	);
	const tapeGuideProgress = $derived(
		tapePattern.segments.length
			? Math.min(
					1,
					Math.max(0, tapeGuideIndex + 1) / tapePattern.segments.length
				)
			: 0
	);
	const showTapeOverlay = $derived(
		showTape && showGuides && Boolean(activeEntry) && measurements.fits
	);

	// One scale for both: the zoom slider sets pixels per square, and the canvas
	// is drawn against that same ratio so the margins you see are the real ones.
	const pxPerCm = $derived(squareCm > 0 ? cellPx / squareCm : 0);
	const sheetWidthPx = $derived(Math.max(0, canvasWidthCm * pxPerCm) || 0);
	const sheetHeightPx = $derived(Math.max(0, canvasHeightCm * pxPerCm) || 0);

	// A plain function, not $derived: it takes an argument, so there is nothing to
	// memoise. Its reads of `grid` and `painted` are tracked through the call by
	// whichever reaction invokes it.
	function paintedCount(entry: PaletteEntry) {
		let count = 0;
		for (let i = 0; i < cellIds.length; i++) {
			if (cellIds[i] === entry.id && painted[i]) count++;
		}
		return count;
	}

	function handleZoomInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (Number.isFinite(value)) preferredCellPx = value;
	}

	function handleGridPaneSize(size: ElementSize) {
		gridPaneSize = size;
	}

	const totalPainted = $derived(
		palette
			.filter((entry) => !entry.isBase)
			.reduce((acc, entry) => acc + paintedCount(entry), 0)
	);

	function progressStorageKey(k: string) {
		return `paint:progress:${k}`;
	}

	function loadProgress(k: string, size: number): boolean[] {
		const result: boolean[] = new Array(size).fill(false);
		try {
			const raw = localStorage.getItem(progressStorageKey(k));
			if (raw) {
				for (const index of JSON.parse(raw) as number[]) {
					if (index >= 0 && index < size) result[index] = true;
				}
			}
		} catch (e) {
			// A corrupt entry should not block painting.
		}
		return result;
	}

	function saveProgress() {
		if (!browser) return;
		const indices: number[] = [];
		painted.forEach((isPainted, i) => isPainted && indices.push(i));
		try {
			localStorage.setItem(progressStorageKey(key), JSON.stringify(indices));
		} catch (e) {
			// Private mode, quota, etc.
		}
	}

	function handleToggleCell(index: number) {
		painted[index] = !painted[index];
		saveProgress();
	}

	function setPainted(index: number, value: boolean) {
		painted[index] = value;
		saveProgress();
	}

	function handleResetProgress() {
		painted = new Array(params.width * params.height).fill(false);
		stepIndex = -1;
		saveProgress();
	}

	function handleGeneratePattern() {
		params = { ...params, seed: generateSeed() };
	}

	function handleGenerateCombination() {
		if (!canGenerateCombination) return;
		const current = selectedPaints
			.map((paint) => paint.sourceIndex)
			.sort((a, b) => a - b)
			.join(",");

		// A fresh random seed can occasionally rank the same subset first. Retry so
		// the button visibly produces a different combination whenever one exists.
		for (let attempt = 0; attempt < 20; attempt++) {
			const combinationSeed = generateSeed();
			const next = selectPaintColors({
				...params,
				combinationSeed,
				selectedColorIndices: []
			})
				.map((paint) => paint.sourceIndex)
				.sort((a, b) => a - b)
				.join(",");

			if (next !== current) {
				params = { ...params, combinationSeed, selectedColorIndices: [] };
				selectedPaintId = null;
				return;
			}
		}
	}

	async function handleShare() {
		clearTimeout(shareResetTimer);
		try {
			await navigator.clipboard.writeText(productionShareUrl($page.url));
			shareStatus = "copied";
		} catch {
			shareStatus = "error";
		}
		shareResetTimer = setTimeout(() => (shareStatus = "idle"), 2000);
	}

	/** Freezes the generated palette into editable slots, in engine order. */
	function materializeColors(): string[] {
		if (params.colors.length) return params.colors;
		const colors = [...engineColors];
		params = { ...params, colors };
		return colors;
	}

	function sourceIndexForEntry(entry: PaletteEntry): number | null {
		if (entry.sourceIndex === null) return null;
		if (!params.colors.length) return entry.sourceIndex;
		return selectedPaints[entry.sourceIndex]?.sourceIndex ?? null;
	}

	function handleChangeColor(entry: PaletteEntry, value: string) {
		const sourceIndex = sourceIndexForEntry(entry);
		if (sourceIndex === null) return;
		const colors = [...materializeColors()];
		if (sourceIndex >= colors.length) return;
		colors[sourceIndex] = value;
		params = { ...params, colors };
	}

	function handleChangeOwnedColor(sourceIndex: number, value: string) {
		if (sourceIndex >= params.colors.length) return;
		const colors = [...params.colors];
		colors[sourceIndex] = value;
		params = { ...params, colors };
	}

	function handleToggleOwnedPaint(sourceIndex: number) {
		const current = selectedPaints.map((paint) => paint.sourceIndex);
		const isUsed = current.includes(sourceIndex);

		if (isUsed && current.length <= 1) return;

		const selectedColorIndices = isUsed
			? current.filter((index) => index !== sourceIndex)
			: [...current, sourceIndex];

		params = {
			...params,
			selectedColorIndices,
			numberOfColors: selectedColorIndices.length
		};
		// Palette clicks configure the combination; isolation stays in Painting.
		selectedPaintId = null;
	}

	function handleAddColor() {
		const colors = [...materializeColors(), randomHex()];
		params = { ...params, colors };
	}

	function handleRemoveColor() {
		const colors = materializeColors().slice(0, -1);
		if (colors.length < 1) return;
		const selectedColorIndices = params.selectedColorIndices.filter(
			(index) => index < colors.length
		);
		params = {
			...params,
			colors,
			selectedColorIndices,
			numberOfColors: selectedColorIndices.length
				? selectedColorIndices.length
				: Math.min(params.numberOfColors, colors.length)
		};
	}

	type NumericParam = "width" | "height" | "tileSize";

	function handleChangeNumber(key: NumericParam, event: Event) {
		const value = (event.target as HTMLInputElement).valueAsNumber;

		if (!Number.isFinite(value) || value < 1) {
			return;
		}

		// Layout-affecting values are part of layoutKey, so changing one swaps in
		// that pattern's own saved progress.
		params = { ...params, [key]: value };
	}

	function handleSquareSize(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (!Number.isFinite(value) || value <= 0) return;
		squareCm = value;
		tapeGuideIndex = -1;
	}

	function handleTapeWidth(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.valueAsNumber;
		// A number field is briefly empty while its contents are replaced. Do not
		// write a fallback into the DOM mid-edit or typing `1` can become `0.11`.
		if (!Number.isFinite(value) || value <= 0) return;
		tapeWidthCm = value;
		tapeGuideIndex = -1;
	}

	function restoreTapeWidth(event: FocusEvent) {
		const input = event.currentTarget as HTMLInputElement;
		if (!Number.isFinite(input.valueAsNumber) || input.valueAsNumber <= 0) {
			input.value = String(actualTapeWidthCm);
		}
	}

	function setActiveTapeBatch(next: TapeBatchState) {
		if (!tapeBatchKey) return;
		tapeBatches[tapeBatchKey] = next;
	}

	function updateTapeSelection(index: number, checked: boolean) {
		const next = new Set(selectedTapeCells);
		if (checked) next.add(index);
		else next.delete(index);

		setActiveTapeBatch({
			selected: [...next].sort((a, b) => a - b),
			generated: null,
			showOverlay: false
		});
		tapeGuideIndex = -1;
	}

	function selectAllTapeSquares() {
		setActiveTapeBatch({
			selected: steps.map((step) => step.index),
			generated: null,
			showOverlay: false
		});
		tapeGuideIndex = -1;
	}

	function clearTapeSquares() {
		setActiveTapeBatch({
			selected: [],
			generated: null,
			showOverlay: false
		});
		tapeGuideIndex = -1;
	}

	function generateTapePattern() {
		if (!measurements.fits || !selectedTapeCells.length) return;
		setActiveTapeBatch({
			selected: [...selectedTapeCells],
			generated: [...selectedTapeCells],
			showOverlay: true
		});
		tapeGuideIndex = -1;
	}

	function toggleTapeOverlay() {
		if (!hasGeneratedTape) return;
		const showOverlay = !activeTapeBatch.showOverlay;
		setActiveTapeBatch({
			...activeTapeBatch,
			showOverlay
		});
		if (!showOverlay) tapeGuideIndex = -1;
	}

	function showTapeGuideOverlay() {
		showGuides = true;
		if (activeTapeBatch.showOverlay) return;
		setActiveTapeBatch({ ...activeTapeBatch, showOverlay: true });
	}

	function goNextTape() {
		const count = tapePattern.segments.length;
		if (!count) return;

		showTapeGuideOverlay();
		if (tapeGuideIndex < 0 || tapeGuideIndex >= count) {
			tapeGuideIndex = 0;
		} else {
			tapeGuideIndex += 1;
		}
	}

	function goPreviousTape() {
		const count = tapePattern.segments.length;
		if (!count || tapeGuideIndex <= 0) return;

		showTapeGuideOverlay();
		tapeGuideIndex = Math.min(tapeGuideIndex, count) - 1;
	}

	function tapePosition(segment: (typeof tapePattern.segments)[number]) {
		const xStart = round(segment.xCm, 2);
		const xEnd = round(segment.xCm + segment.widthCm, 2);
		const yStart = round(segment.yCm, 2);
		const yEnd = round(segment.yCm + segment.heightCm, 2);

		return segment.orientation === "horizontal"
			? `Runs from ${xStart} to ${xEnd} cm across; its long edges sit ${yStart} and ${yEnd} cm from the canvas top.`
			: `Runs from ${yStart} to ${yEnd} cm down; its long edges sit ${xStart} and ${xEnd} cm from the canvas left.`;
	}

	function handleSelectColor(paintId: string | null) {
		selectedPaintId = paintId;
		// Resume where the color was left off: the first square not yet painted.
		stepIndex = -1;
		tapeGuideIndex = -1;
	}

	/** Moving on marks the square you are leaving as painted. */
	function goNextStep() {
		if (!steps.length || stepIndex >= steps.length - 1) {
			// On the last square, "next" just finishes it.
			if (stepIndex === steps.length - 1 && stepIndex >= 0) {
				setPainted(steps[stepIndex].index, true);
			}
			return;
		}

		if (stepIndex >= 0) {
			setPainted(steps[stepIndex].index, true);
		}

		stepIndex = stepIndex + 1;
		scrollStepIntoView();
	}

	/** The exact inverse: stepping back un-paints the square you return to. */
	function goPreviousStep() {
		if (stepIndex < 0) return;

		stepIndex = stepIndex - 1;

		// Indexed defensively: shrinking the grid can leave stepIndex past the end
		// of a shorter `steps`, and this used to throw on steps[stepIndex].index.
		const step = steps[stepIndex];

		if (step) {
			setPainted(step.index, false);
		}

		scrollStepIntoView();
	}

	function goToStep(index: number) {
		stepIndex = index;
		scrollStepIntoView();
	}

	async function scrollStepIntoView() {
		await tick();
		stepList
			?.querySelector(`[data-step="${stepIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!steps.length) return;

		// instanceof, not `target?.matches`: the target can be window or document,
		// which are truthy but have no matches().
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.matches("input, select, textarea")
		) {
			return;
		}

		if (event.key === "ArrowRight" || event.key === " ") {
			event.preventDefault();
			goNextStep();
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			goPreviousStep();
		}
	}

	/**
	 * Samples the engine's own canvas at each cell centre and compares it to the
	 * grid we render. Same engine on both sides, so anything but an exact match
	 * means the DOM grid's row/column mapping is wrong.
	 */
	function handleVerify(canvasElement: HTMLCanvasElement | undefined) {
		if (!canvasElement) return;
		const context = canvasElement.getContext("2d");
		if (!context) {
			verifyStatus = "no 2d context";
			return;
		}

		const cell = canvasElement.width / params.width;
		let mismatches = 0;

		for (let i = 0; i < grid.length; i++) {
			const x = Math.floor((i % params.width) * cell + cell / 2);
			const y = Math.floor(Math.floor(i / params.width) * cell + cell / 2);
			const [r, g, b] = context.getImageData(x, y, 1, 1).data;
			const hex = `#${[r, g, b]
				.map((v) => v.toString(16).padStart(2, "0"))
				.join("")}`;
			if (hex.toLowerCase() !== grid[i].toLowerCase()) mismatches++;
		}

		verifyStatus = mismatches
			? `${mismatches} / ${grid.length} cells differ`
			: `all ${grid.length} cells match`;
	}

	// $state because it is a bind: target on the Identicon component: a plain let
	// would never receive the canvas, and getImageData below would throw.
	let previewCanvas = $state<HTMLCanvasElement | undefined>();
</script>

<svelte:head>
	<title>Paint mode | {params.seed}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="page">
	<header class="header">
		<h1>Paint mode</h1>
		<p class="sub">
			{params.width}x{params.height} &middot; seed <b>{params.seed}</b>
		</p>
		<button
			class="preview-toggle"
			class:on={!showGuides}
			aria-pressed={!showGuides}
			onclick={() => (showGuides = !showGuides)}
		>
			{showGuides ? "Preview final" : "Show guides"}
		</button>
		<button
			class="share-button"
			class:copied={shareStatus === "copied"}
			class:error={shareStatus === "error"}
			onclick={handleShare}
			title="Copy a production link"
			aria-live="polite"
		>
			{shareStatus === "copied"
				? "Copied"
				: shareStatus === "error"
					? "Copy failed"
					: "Share"}
		</button>
		<a class="back" href={playgroundHref}>Playground</a>
	</header>

	<div class="body">
		<section class="grid-pane" use:observeElementSize={handleGridPaneSize}>
			<div class="grid-holder">
				<PaintGrid
					{grid}
					{cellIds}
					width={params.width}
					height={params.height}
					baseCellId={baseEntry?.id ?? ""}
					activeCellId={activePaintId}
					{painted}
					{focusRow}
					{focusIndex}
					{cellPx}
					{squareCm}
					canvasMarginXCm={measurements.marginXCm}
					canvasMarginYCm={measurements.marginYCm}
					{sheetWidthPx}
					{sheetHeightPx}
					sheetColor={canvasColor}
					tapeSegments={tapePattern.segments}
					showTape={showTapeOverlay}
					tapeGuideIndex={currentTape ? tapeGuideIndex : null}
					{showGuides}
					symetry={params.symetry}
					onToggleCell={handleToggleCell}
				/>
			</div>
		</section>

		<aside class="controls">
			<section class="panel">
				<h2>Identicon</h2>
				<div class="preview">
					<Identicon
						bind:canvasElement={previewCanvas}
						seed={params.seed}
						width={params.width}
						height={params.height}
						pixelSize={4}
						symetry={params.symetry}
						symetryAxis={params.symetryAxis}
						tileSize={params.tileSize}
						numberOfColors={params.numberOfColors}
						colors={engineColors}
						text={params.text || undefined}
						textColor={params.textColor}
						textPosition={params.textPosition}
						textFont={params.textFont}
						onColors={undefined}
					/>
					<div class="preview-meta">
						<p>{grid.length} cells</p>
						<p><b>{toPaint}</b> foreground cells</p>
						<p class="muted">
							{grid.length - toPaint} generated background cells
						</p>
					</div>
				</div>
				<div class="row">
					<input type="text" bind:value={params.seed} placeholder="Seed" />
					<button onclick={handleGeneratePattern}>New pattern</button>
				</div>
				<div class="row">
					<button class="ghost" onclick={() => handleVerify(previewCanvas)}>
						Check grid matches canvas
					</button>
					{#if verifyStatus}
						<span class="verify" class:bad={!verifyStatus.startsWith("all")}>
							{verifyStatus}
						</span>
					{/if}
				</div>
			</section>

			<section class="panel">
				<h2>My paints</h2>
				{#if params.colors.length}
					<p class="hint">
						Add every tube you own. The current combination uses
						{engineColors.length} from your full palette. Click a swatch to include
						or remove it. Changing a hex does not move a single cell.
					</p>
				{:else}
					<p class="hint">
						Choose how many colors to generate, or add a paint to start your
						full palette.
					</p>
				{/if}

				<p class="color-count">
					<b>{engineColors.length}</b>
					{engineColors.length === 1 ? "color" : "colors"} used
					<span class="muted">
						{params.colors.length
							? `of ${params.colors.length}`
							: "· generated"}
					</span>
				</p>

				<div class="row">
					<button
						class="ghost"
						disabled={!canGenerateCombination}
						title={canGenerateCombination
							? "Choose different paints without changing the pattern"
							: "Add more paints than the number of colors used"}
						onclick={handleGenerateCombination}
					>
						New color combination
					</button>
				</div>

				{#if params.colors.length}
					<p class="palette-heading">Full palette</p>
					{#each ownedPaints as paint}
						<div
							class="paint-row"
							class:used={Boolean(paint.entry)}
							class:unused={!paint.entry}
						>
							<button
								class="swatch"
								style="background:{paint.color}"
								title={paint.entry
									? selectedPaints.length <= 1
										? "At least one paint must be used"
										: "Remove from this color combination"
									: "Use in this color combination"}
								aria-label={paint.entry
									? `Remove ${paint.color} from the color combination`
									: `Use ${paint.color} in the color combination`}
								aria-pressed={Boolean(paint.entry)}
								aria-disabled={Boolean(paint.entry) &&
									selectedPaints.length <= 1}
								onclick={() => handleToggleOwnedPaint(paint.sourceIndex)}
							></button>
							<span class="tag">{paint.entry?.label ?? "—"}</span>
							<input
								type="color"
								value={paint.color}
								oninput={(event) =>
									handleChangeOwnedColor(
										paint.sourceIndex,
										event.currentTarget.value
									)}
							/>
							<span class="hex" title="Click to select">{paint.color}</span>
							{#if paint.entry}
								<span class="count">
									{paint.entry.count}
									<span class="muted">({round(paint.entry.pct, 1)}%)</span>
								</span>
								{#if paint.entry.isBase}
									<span class="badge">background</span>
								{:else}
									<span class="badge">used</span>
								{/if}
							{:else}
								<span class="badge">available</span>
							{/if}
						</div>
					{/each}

					{#each textPaints as entry}
						<div class="paint-row">
							<span
								class="swatch"
								style="background:{entry.color}"
								aria-hidden="true"
							></span>
							<span class="tag">{entry.label}</span>
							<span class="tag muted">text</span>
							<span class="hex" title="Click to select">{entry.color}</span>
							<span class="count">
								{entry.count}
								<span class="muted">({round(entry.pct, 1)}%)</span>
							</span>
						</div>
					{/each}
				{:else}
					<p class="palette-heading">Generated palette</p>
					{#each palette as entry}
						{@const editable = entry.sourceIndex !== null}
						<div class="paint-row">
							<span
								class="swatch"
								style="background:{entry.color}"
								aria-hidden="true"
							></span>
							<span class="tag">{entry.label}</span>
							{#if editable}
								<input
									type="color"
									value={entry.color}
									oninput={(event) =>
										handleChangeColor(entry, event.currentTarget.value)}
								/>
							{:else}
								<span class="tag muted">text</span>
							{/if}
							<span class="hex" title="Click to select">{entry.color}</span>
							<span class="count">
								{entry.count}
								<span class="muted">({round(entry.pct, 1)}%)</span>
							</span>
							{#if entry.isBase}
								<span class="badge">background</span>
							{/if}
						</div>
					{/each}
				{/if}

				<div class="row">
					<button onclick={handleRemoveColor}>-</button>
					<button onclick={handleAddColor}>+</button>
					<span class="hint inline">edit the full palette</span>
				</div>
			</section>

			<section class="panel">
				<h2>Painting</h2>
				<div class="row wrap">
					<button
						class="chip"
						class:on={activePaintId === null}
						onclick={() => handleSelectColor(null)}>All</button
					>
					{#each palette as entry}
						<button
							class="chip"
							class:on={activePaintId === entry.id}
							onclick={() => handleSelectColor(entry.id)}
						>
							<span class="dot" style="background:{entry.color}"></span>
							{entry.label}
						</button>
					{/each}
				</div>

				{#if activeEntry}
					<div class="progress">
						<div class="bar">
							<span
								style="width:{(paintedCount(activeEntry) / activeEntry.count) *
									100}%"
							></span>
						</div>
						<p>
							{activeEntry.label}: {paintedCount(activeEntry)} / {activeEntry.count}
							cells
						</p>
					</div>
				{:else}
					<div class="progress">
						<div class="bar">
							<span style="width:{(totalPainted / toPaint) * 100}%"></span>
						</div>
						<p>Overall: {totalPainted} / {toPaint} cells</p>
					</div>
				{/if}
				{#if activeEntry?.isBase}
					<p class="hint">
						This is the generated background. If you used it as the physical
						base coat, you can skip its guides. Otherwise, use its tape and
						Square guides like any other color.
					</p>
				{/if}

				<div class="row">
					<label class="zoom">
						Zoom
						<input
							type="range"
							min={zoomMin}
							max={zoomMax}
							step="0.01"
							value={cellPx}
							oninput={handleZoomInput}
						/>
					</label>
					<button class="ghost" onclick={handleResetProgress}>Reset</button>
				</div>
			</section>

			{#if activeEntry}
				<section class="panel tape-panel">
					<h2>Tape pattern &middot; {activeEntry.label}</h2>
					<div class="row">
						<label class="inline-control">
							<span class="tag">Tape width</span>
							<input
								type="number"
								value={actualTapeWidthCm}
								oninput={handleTapeWidth}
								onblur={restoreTapeWidth}
								aria-label="Tape width in centimetres"
								min="0.1"
								step="0.1"
							/>
							<span class="tag muted">cm</span>
						</label>
					</div>
					<p class="hint">
						Use the tape's long factory edge for every painted boundary. Each
						strip extends {round(tapeEndExtension, 2)} cm past each end so perpendicular
						strips overlap at the corners.
					</p>

					{#if !measurements.fits}
						<p class="warning">
							The artwork must fit the canvas before a physical tape pattern can
							be calculated.
						</p>
					{/if}

					<div class="tape-selection-heading">
						<p class="tape-selection-count">
							<b>{selectedTapeCells.length}</b> / {steps.length} squares selected
						</p>
						<div class="row">
							<button
								class="ghost"
								disabled={selectedTapeCells.length === steps.length}
								onclick={selectAllTapeSquares}>Select all</button
							>
							<button
								class="ghost"
								disabled={!selectedTapeCells.length}
								onclick={clearTapeSquares}>Clear</button
							>
						</div>
					</div>

					<ol class="tape-square-list" aria-label="Squares for tape pattern">
						{#each steps as step, index}
							<li class:selected={selectedTapeSet.has(step.index)}>
								<label>
									<input
										type="checkbox"
										checked={selectedTapeSet.has(step.index)}
										onchange={(event) =>
											updateTapeSelection(
												step.index,
												event.currentTarget.checked
											)}
									/>
									<span class="tape-square-number">{index + 1}</span>
									<span>row {step.row}, column {step.column}</span>
									{#if painted[step.index]}
										<span class="badge">painted</span>
									{/if}
								</label>
							</li>
						{/each}
					</ol>

					<div class="row tape-actions">
						<button
							disabled={!measurements.fits || !selectedTapeCells.length}
							onclick={generateTapePattern}>Generate tape</button
						>
						{#if hasGeneratedTape}
							<button
								class="ghost tape-toggle"
								class:on={showTape}
								aria-pressed={showTape}
								onclick={toggleTapeOverlay}
							>
								{showTape ? "Hide tape" : "Show tape"}
							</button>
						{/if}
					</div>

					{#if hasGeneratedTape}
						<p class="hint">
							Optimized for {generatedTapeCells.length} selected
							{generatedTapeCells.length === 1 ? "square" : "squares"}. Align
							the long factory edges to the highlighted boundaries and keep
							every scissor-cut end beyond its corner.
						</p>
						<p class="tape-summary">
							<b>{tapePattern.segments.length}</b> strips &middot;
							<b>{round(tapePattern.totalLengthCm, 1)} cm</b> minimum tape
						</p>

						{#if tapePattern.overlapCells.length}
							<p class="tape-warning">
								With {round(actualTapeWidthCm, 2)} cm tape and the end overlap, the
								mask reaches
								{tapePattern.overlapCells.length} exposed {activeEntry.label}
								{tapePattern.overlapCells.length === 1 ? "square" : "squares"}.
								Do not rely on a scissor-cut edge here; split these inside
								corners into a separate paint pass.
							</p>
						{/if}

						{#if tapePattern.segments.length}
							<div class="tape-guide" aria-live="polite">
								<div class="tape-guide-heading">
									<h3>Placement guide</h3>
									<span>
										{Math.min(
											Math.max(0, tapeGuideIndex + 1),
											tapePattern.segments.length
										)} / {tapePattern.segments.length}
									</span>
								</div>
								<div class="tape-guide-progress" aria-hidden="true">
									<span style="width:{tapeGuideProgress * 100}%"></span>
								</div>

								{#if currentTape}
									<p class="tape-guide-current">
										<b>{currentTape.orientation}</b>
										<span>{round(currentTape.lengthCm, 2)} cm strip</span>
									</p>
									<p class="hint">{tapePosition(currentTape)}</p>
								{:else if tapeGuideComplete}
									<p class="tape-guide-done">All strips placed.</p>
								{:else}
									<p class="hint">
										Follow the generated pattern one strip at a time.
									</p>
								{/if}

								<div class="row tape-guide-actions">
									<button
										class="ghost"
										disabled={tapeGuideIndex <= 0}
										onclick={goPreviousTape}>Previous</button
									>
									<button onclick={goNextTape}>
										{tapeGuideComplete
											? "Restart guide"
											: tapeGuideIndex < 0
												? "Start guide"
												: tapeGuideIndex === tapePattern.segments.length - 1
													? "Finish"
													: "Placed, next"}
									</button>
								</div>
							</div>
						{/if}
					{/if}
				</section>
			{/if}

			{#if steps.length}
				<section class="panel">
					<h2>Square guide</h2>
					<p class="current-step">
						{#if currentStep}
							row <b>{currentStep.row}</b> column <b>{currentStep.column}</b>
						{:else}
							not started
						{/if}
					</p>
					<div class="row">
						<button onclick={goPreviousStep} disabled={stepIndex < 0}
							>&lt;</button
						>
						<button onclick={goNextStep}>
							{stepIndex < 0 ? "Start" : "Done, next"}
						</button>
						<span class="hint inline step-count">
							{stepIndex + 1} / {steps.length}
							&middot; arrow keys
						</span>
					</div>
					<ol class="guide" bind:this={stepList}>
						{#each steps as step, i}
							<li
								class:on={i === stepIndex}
								class:done={painted[step.index]}
								data-step={i}
							>
								<button onclick={() => goToStep(i)}>
									<b>{i + 1}</b>
									<span>row {step.row} column {step.column}</span>
									<span class="muted">{painted[step.index] ? "done" : ""}</span>
								</button>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			<section class="panel">
				<h2>Identicon settings</h2>
				<div class="row">
					<span class="tag">W</span>
					<input
						type="number"
						min="1"
						max="100"
						value={params.width}
						oninput={(event) => handleChangeNumber("width", event)}
					/>
					<span class="tag">H</span>
					<input
						type="number"
						min="1"
						max="100"
						value={params.height}
						oninput={(event) => handleChangeNumber("height", event)}
					/>
					<span class="tag muted">squares</span>
				</div>
				<label class="row">
					<span class="tag">Symetry</span>
					<select bind:value={params.symetry}>
						<option value="none">None</option>
						<option value="axial">Axial (left-right)</option>
						<option value="horizontal">Horizontal (top-bottom)</option>
						<option value="central">Central (4-fold)</option>
						<option value="kaleidoscope">Kaleidoscope (8-fold)</option>
						<option value="tile">Tile (repeat)</option>
					</select>
				</label>
				{#if params.symetry === "tile"}
					<label class="row">
						<span class="tag">Tile size</span>
						<input
							type="number"
							min="1"
							max="50"
							value={params.tileSize}
							oninput={(event) => handleChangeNumber("tileSize", event)}
						/>
					</label>
				{:else if params.symetry !== "none"}
					<label class="row">
						<span class="tag">Mirror axis</span>
						<select bind:value={params.symetryAxis}>
							<option value="gap">Between columns</option>
							<option value="column">On a column</option>
							<option value="exact">Exact mirror</option>
						</select>
					</label>
				{/if}
				<div class="row">
					<label class="inline-control">
						<span class="tag">Text</span>
						<input type="text" bind:value={params.text} placeholder="No text" />
					</label>
					<label class="color-control" title="Text color">
						<span class="sr-only">Text color</span>
						<input type="color" bind:value={params.textColor} />
					</label>
				</div>
				<div class="row">
					<label class="inline-control">
						<span class="tag">Position</span>
						<select bind:value={params.textPosition}>
							<option value="top-center">Top center</option>
							<option value="top-left">Top left</option>
							<option value="top-right">Top right</option>
							<option value="bottom-center">Bottom center</option>
							<option value="bottom-left">Bottom left</option>
							<option value="bottom-right">Bottom right</option>
							<option value="center">Center</option>
						</select>
					</label>
					<label class="inline-control compact">
						<span class="tag">Font</span>
						<select bind:value={params.textFont}>
							<option value="3x4">3x4</option>
							<option value="3x3">3x3</option>
						</select>
					</label>
				</div>
				{#if params.textFont === "3x3" && /[^a-zA-Z]/.test(params.text)}
					<p class="hint">
						The 3x3 font only includes A-Z; unsupported characters are dropped.
					</p>
				{/if}
				<div class="row">
					<span class="tag">Square</span>
					<input
						type="number"
						value={squareCm}
						oninput={handleSquareSize}
						aria-label="Square size in centimetres"
						min="0.1"
						step="0.1"
						class="narrow"
					/>
					<span class="tag muted">cm</span>
					<span class="hint inline">{round(measurements.squareMm, 1)}mm</span>
				</div>
				<dl class="measures">
					<dt>Full size</dt>
					<dd class="strong">
						{round(measurements.identiconWidthCm, 2)} x {round(
							measurements.identiconHeightCm,
							2
						)} cm
					</dd>
					<dt>Every 5th</dt>
					<dd>{round(measurements.blockCm, 2)} cm</dd>
				</dl>
				<p class="hint">Changing the number of squares redraws the pattern.</p>
			</section>

			<section class="panel">
				<h2>Canvas</h2>
				<label class="row">
					<span class="tag">Color</span>
					<input type="color" bind:value={canvasColor} />
					<span class="hex">{canvasColor}</span>
				</label>
				<div class="row">
					<span class="tag">W</span>
					<input
						type="number"
						bind:value={canvasWidthCm}
						oninput={() => (tapeGuideIndex = -1)}
						aria-label="Canvas width in centimetres"
						min="1"
					/>
					<span class="tag">H</span>
					<input
						type="number"
						bind:value={canvasHeightCm}
						oninput={() => (tapeGuideIndex = -1)}
						aria-label="Canvas height in centimetres"
						min="1"
					/>
					<span class="tag muted">cm</span>
				</div>
				<dl class="measures">
					<dt>Border</dt>
					<dd>
						{#if measurements.fits}
							{round(measurements.marginXCm, 2)} cm sides &middot; {round(
								measurements.marginYCm,
								2
							)} cm top and bottom
						{:else}
							&mdash;
						{/if}
					</dd>
				</dl>
				{#each measurements.warnings as warning}
					<p class="warning">{warning}</p>
				{/each}
			</section>

			<section class="panel">
				<button class="howto-toggle" onclick={() => (showHowTo = !showHowTo)}>
					{showHowTo ? "-" : "+"} How to paint this
				</button>
				{#if showHowTo}
					<ol class="howto">
						<li>
							Paint a swatch of each acrylic, let it dry (acrylic dries darker),
							photograph it, sample the hex and enter it above. No mixing, no
							color matching.
						</li>
						<li>
							Base coat the whole canvas with the paint that gives you the best
							coverage. If that is not the generated background
							<b style="color:{baseEntry?.color}">{baseEntry?.color}</b>, use
							the background color's tape pattern like any other color.
						</li>
						<li>
							Pick a non-base color and open its tape pattern. Use each strip's
							long factory edge to outline the color, and let every scissor-cut
							end run past the corner underneath the perpendicular strip.
						</li>
						{#if params.symetry === "axial"}
							<li>
								The pattern is mirrored down the dashed line, so you only have
								to read {Math.ceil(params.width / 2)} columns.
							</li>
						{/if}
						<li>
							Paint the exposed squares, remove the tape, and repeat for each
							color. Pick a color above to isolate it and tap cells off as you
							go.
						</li>
					</ol>
				{/if}
			</section>
		</aside>
	</div>
</main>

<style>
	.page {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 20px;
		height: 100vh;
		height: 100dvh;
		padding: 20px;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 16px;
		min-width: 0;
	}

	h1 {
		font-size: 20px;
	}

	.sub {
		color: #8b929d;
		font-size: 14px;
	}

	.back {
		color: gold;
	}

	.preview-toggle,
	.share-button {
		background: #2e333b;
		color: #b8bfc9;
		white-space: nowrap;
	}

	.preview-toggle {
		margin-left: auto;
	}

	.preview-toggle:hover,
	.preview-toggle.on,
	.share-button:hover {
		background: gold;
		color: #22252b;
	}

	.share-button {
		min-width: 112px;
	}

	.share-button.copied {
		background: #7dd97d;
		color: #14242c;
	}

	.share-button.error {
		background: #ff7773;
		color: #2a1011;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) min(380px, 45vw);
		gap: clamp(8px, 2vw, 24px);
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.grid-pane {
		display: grid;
		place-items: center;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.grid-holder {
		width: max-content;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding-right: 4px;
	}

	.panel {
		background: #1a1d22;
		border: 1px solid #2e333b;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	h2 {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8b929d;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.row.wrap {
		flex-wrap: wrap;
	}

	.row input[type="text"],
	.row input[type="number"],
	.row select {
		min-width: 0;
		flex: 1;
	}

	.inline-control {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: 1;
	}

	.inline-control select {
		min-width: 0;
		flex: 1;
	}

	.inline-control.compact {
		flex: 0 0 auto;
	}

	.color-control {
		display: flex;
		flex: 0 0 auto;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.hint {
		font-size: 12px;
		line-height: 1.5;
		color: #8b929d;
	}

	.hint.inline {
		margin-left: 4px;
	}

	.color-count {
		margin: 0;
		font-size: 13px;
	}

	.palette-heading {
		margin: 2px 0 0;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #b8bfc9;
	}

	.muted {
		color: #6f7681;
	}

	.warning {
		font-size: 12px;
		line-height: 1.5;
		color: #22252b;
		background: gold;
		padding: 8px;
	}

	.preview {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.preview-meta {
		font-size: 13px;
		line-height: 1.6;
	}

	.verify {
		font-size: 12px;
		color: #7dd97d;
	}

	.verify.bad {
		color: #ff8f6b;
	}

	.paint-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}

	.paint-row.unused {
		opacity: 0.72;
	}

	.swatch {
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid #3a3f47;
		flex-shrink: 0;
	}

	.swatch[aria-pressed="true"] {
		border-color: gold;
		box-shadow: 0 0 0 2px gold;
	}

	.swatch[aria-disabled="true"] {
		cursor: not-allowed;
	}

	.tag {
		font-size: 12px;
		color: #8b929d;
		flex-shrink: 0;
	}

	.hex {
		font-size: 12px;
		color: #b8bfc9;
		flex-shrink: 0;
		cursor: text;
		/* One click selects the whole value. */
		user-select: all;
		-webkit-user-select: all;
	}

	.count {
		margin-left: auto;
		font-size: 12px;
	}

	.badge {
		background: #2e333b;
		color: #b8bfc9;
		font-size: 11px;
		padding: 3px 6px;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #2e333b;
		color: #b8bfc9;
		height: 30px;
		padding: 0 10px;
		font-size: 13px;
	}

	.chip.on {
		background: gold;
		color: #22252b;
	}

	.chip .dot {
		width: 12px;
		height: 12px;
		border: 1px solid rgba(0, 0, 0, 0.35);
	}

	.progress p {
		font-size: 12px;
		color: #8b929d;
		margin-top: 6px;
	}

	.bar {
		height: 6px;
		background: #2e333b;
	}

	.bar span {
		display: block;
		height: 100%;
		background: gold;
	}

	.zoom {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #8b929d;
		flex: 1;
	}

	.zoom input {
		flex: 1;
	}

	button.ghost {
		background: #2e333b;
		color: #b8bfc9;
	}

	button.ghost:hover {
		background: #3a3f47;
	}

	button.ghost:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.tape-toggle.on,
	.tape-toggle.on:hover {
		background: #87ceeb;
		color: #14242c;
	}

	.tape-summary {
		font-size: 13px;
		color: #b8bfc9;
	}

	.tape-summary b {
		color: #87ceeb;
	}

	.tape-warning {
		font-size: 12px;
		line-height: 1.5;
		color: #2a1011;
		background: #ff7773;
		padding: 8px;
	}

	.tape-guide {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: #15181d;
		border-left: 3px solid #87ceeb;
	}

	.tape-guide-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.tape-guide-heading h3 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #b8bfc9;
	}

	.tape-guide-heading span {
		font-size: 12px;
		font-weight: 700;
		color: #87ceeb;
	}

	.tape-guide-progress {
		height: 3px;
		background: #2e333b;
	}

	.tape-guide-progress span {
		display: block;
		height: 100%;
		background: #87ceeb;
	}

	.tape-guide-current {
		display: flex;
		align-items: baseline;
		gap: 8px;
		color: #b8bfc9;
		font-size: 14px;
	}

	.tape-guide-current b {
		color: gold;
		text-transform: capitalize;
	}

	.tape-guide-done {
		color: #7dd97d;
		font-size: 14px;
		font-weight: 700;
	}

	.tape-guide-actions button:last-child {
		flex: 1;
	}

	.tape-selection-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.tape-selection-heading .row {
		flex-wrap: nowrap;
	}

	.tape-selection-count {
		font-size: 12px;
		color: #b8bfc9;
	}

	.tape-selection-count b {
		color: #87ceeb;
	}

	.tape-square-list {
		list-style: none;
		border-top: 1px solid #2e333b;
		user-select: none;
	}

	.tape-square-list li {
		border-bottom: 1px solid #2e333b;
	}

	.tape-square-list li.selected {
		background: rgba(135, 206, 235, 0.12);
	}

	.tape-square-list label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		font-size: 12px;
		line-height: 1.1;
		color: #b8bfc9;
		cursor: pointer;
	}

	.tape-square-list input {
		width: 14px;
		height: 14px;
		padding: 0;
		flex: 0 0 14px;
		accent-color: #87ceeb;
	}

	.tape-square-number {
		width: 24px;
		color: #87ceeb;
		font-weight: 700;
	}

	.tape-square-list .badge {
		margin-left: auto;
	}

	.tape-actions {
		align-items: stretch;
	}

	.tape-actions > button:first-child {
		flex: 1;
	}

	.guide {
		list-style: none;
		border-top: 1px solid #2e333b;
	}

	.guide li button {
		display: flex;
		gap: 10px;
		width: 100%;
		background: none;
		color: #b8bfc9;
		height: auto;
		padding: 5px 4px;
		font-size: 13px;
		text-align: left;
		border-bottom: 1px solid #2e333b;
	}

	.guide li button b {
		width: 26px;
		color: #6f7681;
		flex-shrink: 0;
	}

	.guide li button span:last-child {
		margin-left: auto;
	}

	.guide li.on button {
		background: #2e333b;
		color: gold;
	}

	.guide li.done button {
		color: #6f7681;
	}

	.guide li.done.on button {
		color: gold;
	}

	.current-step {
		font-size: 15px;
		color: #8b929d;
	}

	.current-step b {
		color: gold;
		font-size: 17px;
	}

	.measures {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 12px;
		font-size: 13px;
	}

	.measures dt {
		color: #8b929d;
	}

	.measures dd.strong {
		color: gold;
	}

	.row input.narrow {
		flex: 0 0 90px;
	}

	.howto-toggle {
		background: none;
		color: #b8bfc9;
		text-align: left;
		padding: 0;
		height: auto;
	}

	.howto-toggle:hover {
		background: none;
		color: gold;
	}

	.howto {
		font-size: 13px;
		line-height: 1.7;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	@media (max-width: 600px) {
		.page {
			gap: 12px;
			padding: 12px;
		}

		.body {
			gap: 8px;
		}

		.header {
			display: grid;
			grid-template-columns: 1fr auto;
			align-items: center;
			gap: 8px 12px;
		}

		.header h1,
		.preview-toggle {
			justify-self: start;
		}

		.header .sub,
		.share-button,
		.header .back {
			justify-self: end;
			text-align: right;
		}

		.header .back {
			grid-column: 2;
		}

		.preview-toggle {
			margin-left: 0;
		}

		.panel {
			padding: 8px;
		}

		.controls .row {
			flex-wrap: wrap;
		}

		.preview,
		.paint-row {
			flex-wrap: wrap;
		}

		.paint-row .count {
			margin-left: 0;
		}

		.zoom {
			flex: 1 1 100%;
			flex-wrap: wrap;
			min-width: 0;
		}

		.zoom input {
			width: 100%;
			min-width: 0;
		}

		.tape-selection-heading {
			flex-wrap: wrap;
		}

		.tape-selection-heading > .row {
			width: 100%;
		}

		.tape-square-list label {
			flex-wrap: wrap;
		}

		.tape-square-list .badge {
			margin-left: 0;
		}
	}
</style>
