<script lang="ts">
	import { browser } from "$app/environment";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import PaintGrid from "../../components/paint/PaintGrid.svelte";
	import { tick } from "svelte";
	import {
		buildPalette,
		buildTapePattern,
		colorCells,
		extractGrid,
		findDuplicateColors,
		generateSeed,
		layoutKey,
		measure,
		parsePaintParams,
		parsePaintSurfaceParams,
		randomHex,
		round,
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
	// What the user picked. All writes go here; `activeColor` below is the value
	// actually valid against the current palette.
	let selectedColor = $state<string | null>(null);
	// Position in the current color's list of squares. -1 = not started.
	let stepIndex = $state(-1);
	let stepList = $state<HTMLElement | undefined>();
	let cellPx = $state(28);
	let squareCm = $state(initialSurface.squareCm);
	let canvasWidthCm = $state(initialSurface.canvasWidthCm);
	let canvasHeightCm = $state(initialSurface.canvasHeightCm);
	let canvasColor = $state(initialSurface.canvasColor);
	let tapeWidthCm = $state(initialSurface.tapeWidthCm);
	let tapeBatches = $state<Record<string, TapeBatchState>>({});
	let showGuides = $state(true);
	let showHowTo = $state(false);
	let verifyStatus = $state("");
	const actualTapeWidthCm = $derived(
		Number.isFinite(tapeWidthCm) && tapeWidthCm > 0 ? tapeWidthCm : 0.1
	);
	const tapeEndExtension = $derived(tapeEndExtensionCm(squareCm));

	// Neither is $state: both exist only to remember what the last run did. As
	// $state they would be read and written by their own effect, which is the
	// textbook self-invalidating loop.
	let loadedKey = "";
	let lastUrl = "";

	// All $derived, not $effect: these are rendered, and effects do not run during
	// SSR, so an effect would ship an empty grid in the server HTML. extractGrid
	// works on the server because it falls back to a stub canvas and the engine
	// fills imageData before it ever asks for a 2d context.
	const extraction = $derived(extractGrid(params));
	const grid = $derived(extraction.grid);
	const engineColors = $derived(extraction.colors);
	const palette = $derived(buildPalette(grid, extraction.backgroundColor));
	const baseEntry = $derived(palette.find((entry) => entry.isBase));
	const toPaint = $derived(
		palette
			.filter((entry) => !entry.isBase)
			.reduce((acc, entry) => acc + entry.count, 0)
	);
	const duplicates = $derived(findDuplicateColors(engineColors));

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
	// leave `activeColor` pointing at a color with no cells, which dimmed the
	// whole grid with nothing selected. There is now no moment at which the
	// selection and the palette disagree, so nothing needs fixing up — and no
	// effect writes state it also reads.
	const activeColor = $derived(
		selectedColor !== null &&
			palette.length &&
			!palette.some((entry) => entry.color === selectedColor)
			? null
			: selectedColor
	);

	const activeEntry = $derived(
		palette.find((entry) => entry.color === activeColor)
	);
	const steps = $derived(
		activeColor && !activeEntry?.isBase
			? colorCells(grid, params.width, activeColor)
			: []
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
	const tapePattern = $derived(
		activeEntry &&
			!activeEntry.isBase &&
			measurements.fits &&
			hasGeneratedTape &&
			generatedTapeCells.length
			? buildTapePattern({
					grid,
					width: params.width,
					height: params.height,
					targetColor: activeEntry.color,
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
	const showTapeOverlay = $derived(
		showTape &&
			showGuides &&
			Boolean(activeEntry && !activeEntry.isBase) &&
			measurements.fits
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
		for (let i = 0; i < grid.length; i++) {
			if (grid[i] === entry.color && painted[i]) count++;
		}
		return count;
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

	function handleGenerateSeed() {
		params = { ...params, seed: generateSeed() };
	}

	/** Freezes the generated palette into editable slots, in engine order. */
	function materializeColors(): string[] {
		if (params.colors.length) return params.colors;
		const colors = [...engineColors];
		params = { ...params, colors };
		return colors;
	}

	function handleChangeColor(entry: PaletteEntry, value: string) {
		const colors = [...materializeColors()];
		const index = colors.indexOf(entry.color);
		if (index === -1) return;
		colors[index] = value;
		// Colors are identified by hex, so repainting the one you have isolated
		// would otherwise drop you back to the "All" view mid-session.
		if (selectedColor === entry.color) {
			selectedColor = value;
		}
		params = { ...params, colors };
	}

	function handleAddColor() {
		const colors = [...materializeColors(), randomHex()];
		params = { ...params, colors, numberOfColors: colors.length };
	}

	function handleRemoveColor() {
		const colors = materializeColors().slice(0, -1);
		if (colors.length < 1) return;
		params = { ...params, colors, numberOfColors: colors.length };
	}

	type NumericParam = "width" | "height" | "tileSize" | "numberOfColors";

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
	}

	function handleTapeWidth(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.valueAsNumber;
		// A number field is briefly empty while its contents are replaced. Do not
		// write a fallback into the DOM mid-edit or typing `1` can become `0.11`.
		if (!Number.isFinite(value) || value <= 0) return;
		tapeWidthCm = value;
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
	}

	function selectAllTapeSquares() {
		setActiveTapeBatch({
			selected: steps.map((step) => step.index),
			generated: null,
			showOverlay: false
		});
	}

	function clearTapeSquares() {
		setActiveTapeBatch({
			selected: [],
			generated: null,
			showOverlay: false
		});
	}

	function generateTapePattern() {
		if (!measurements.fits || !selectedTapeCells.length) return;
		setActiveTapeBatch({
			selected: [...selectedTapeCells],
			generated: [...selectedTapeCells],
			showOverlay: true
		});
	}

	function toggleTapeOverlay() {
		if (!hasGeneratedTape) return;
		setActiveTapeBatch({
			...activeTapeBatch,
			showOverlay: !activeTapeBatch.showOverlay
		});
	}

	function handleSelectColor(color: string | null) {
		selectedColor = color;
		// Resume where the color was left off: the first square not yet painted.
		stepIndex = -1;
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
		<a class="back" href={`/${serializePaintParams(params)}`}>Playground</a>
	</header>

	<div class="body">
		<section class="grid-pane">
			<div class="grid-holder">
				<PaintGrid
					{grid}
					width={params.width}
					height={params.height}
					baseColor={extraction.backgroundColor}
					{activeColor}
					{painted}
					{focusRow}
					{focusIndex}
					{cellPx}
					{sheetWidthPx}
					{sheetHeightPx}
					sheetColor={canvasColor}
					tapeSegments={tapePattern.segments}
					showTape={showTapeOverlay}
					tapeSelectedCells={selectedTapeCells}
					tapeSelectionMode={Boolean(activeEntry && !activeEntry.isBase)}
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
						colors={params.colors.length ? params.colors : undefined}
						text={params.text || undefined}
						textColor={params.textColor}
						textPosition={params.textPosition}
						textFont={params.textFont}
						onColors={undefined}
					/>
					<div class="preview-meta">
						<p>{grid.length} cells</p>
						<p><b>{toPaint}</b> to paint</p>
						<p class="muted">
							{grid.length - toPaint} covered by the base coat
						</p>
					</div>
				</div>
				<div class="row">
					<input type="text" bind:value={params.seed} placeholder="Seed" />
					<button onclick={handleGenerateSeed}>Random</button>
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
				<p class="hint">
					Enter the hex of each tube you own. Changing a hex does not move a
					single cell. Changing the <i>number</i> of colors redraws the pattern.
				</p>

				{#if !params.colors.length}
					<label class="row">
						<span class="tag">Generated colors</span>
						<input
							type="number"
							min="1"
							max="10"
							value={params.numberOfColors}
							oninput={(event) => handleChangeNumber("numberOfColors", event)}
						/>
					</label>
				{/if}

				{#each palette as entry}
					{@const editable = engineColors.indexOf(entry.color) !== -1}
					<div class="paint-row" class:selected={activeColor === entry.color}>
						<button
							class="swatch"
							style="background:{entry.color}"
							title="Isolate {entry.label}"
							onclick={() => handleSelectColor(entry.color)}
						></button>
						<span class="tag">{entry.label}</span>
						{#if editable}
							<input
								type="color"
								value={entry.color}
								oninput={(e) => handleChangeColor(entry, e.currentTarget.value)}
							/>
						{:else}
							<span class="tag muted">text</span>
						{/if}
						<!-- user-select: all, so one click selects the whole hex ready to
						     copy rather than making you drag across 7 characters. -->
						<span class="hex" title="Click to select">{entry.color}</span>
						<span class="count">
							{entry.count}
							<span class="muted">({round(entry.pct, 1)}%)</span>
						</span>
						{#if entry.isBase}
							<span class="badge">base coat</span>
						{/if}
					</div>
				{/each}

				<div class="row">
					<button onclick={handleRemoveColor}>-</button>
					<button onclick={handleAddColor}>+</button>
					<span class="hint inline">changes the pattern</span>
				</div>

				{#if duplicates.length}
					<p class="warning">
						Two slots share the same hex ({duplicates.join(", ")}). They merge
						into one entry, so the counts and per-color progress below will not
						line up with your tubes.
					</p>
				{/if}
			</section>

			<section class="panel">
				<h2>Painting</h2>
				<div class="row wrap">
					<button
						class="chip"
						class:on={activeColor === null}
						onclick={() => handleSelectColor(null)}>All</button
					>
					{#each palette as entry}
						<button
							class="chip"
							class:on={activeColor === entry.color}
							onclick={() => handleSelectColor(entry.color)}
						>
							<span class="dot" style="background:{entry.color}"></span>
							{entry.label}
						</button>
					{/each}
				</div>

				{#if activeEntry && !activeEntry.isBase}
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
				{:else if activeEntry?.isBase}
					<p class="hint">
						This is the base coat. Cover the whole canvas with it once and every
						one of these {activeEntry.count} cells is already done.
					</p>
				{:else}
					<div class="progress">
						<div class="bar">
							<span style="width:{(totalPainted / toPaint) * 100}%"></span>
						</div>
						<p>Overall: {totalPainted} / {toPaint} cells</p>
					</div>
				{/if}

				<div class="row">
					<label class="zoom">
						Zoom
						<input type="range" min="8" max="44" bind:value={cellPx} />
					</label>
					<button class="ghost" onclick={handleResetProgress}>Reset</button>
				</div>
			</section>

			{#if activeEntry && !activeEntry.isBase}
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
						aria-label="Canvas width in centimetres"
						min="1"
					/>
					<span class="tag">H</span>
					<input
						type="number"
						bind:value={canvasHeightCm}
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
							Base coat the whole canvas in
							<b style="color:{baseEntry?.color}">{baseEntry?.color}</b>. Those
							{baseEntry?.count} cells are then finished.
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
		padding: 20px;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 20px;
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

	.preview-toggle {
		margin-left: auto;
		background: #2e333b;
		color: #b8bfc9;
		white-space: nowrap;
	}

	.preview-toggle:hover,
	.preview-toggle.on {
		background: gold;
		color: #22252b;
	}

	.body {
		display: flex;
		align-items: flex-start;
		gap: 24px;
	}

	/* Claims all the space the controls do not, so zooming the grid resizes
	   inside this pane instead of pushing the controls around. */
	.grid-pane {
		flex: 1;
		min-width: 0;
		position: sticky;
		top: 20px;
		overflow: auto;
		max-height: calc(100vh - 40px);
		padding-bottom: 8px;
	}

	/* auto margins centre the grid when it fits and collapse to 0 when it does
	   not, so an over-wide grid stays fully scrollable rather than clipped. */
	.grid-holder {
		width: max-content;
		margin: 0 auto;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 380px;
		flex-shrink: 0;
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

	.paint-row.selected {
		outline: 1px solid gold;
		outline-offset: 3px;
	}

	.swatch {
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid #3a3f47;
		flex-shrink: 0;
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
		max-height: 340px;
		overflow: auto;
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
		max-height: 220px;
		overflow: auto;
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

	@media (max-width: 1000px) {
		.body {
			flex-direction: column;
		}

		.grid-pane {
			flex: none;
			position: static;
			max-height: none;
			width: 100%;
		}

		.controls {
			width: 100%;
		}
	}

	@media (max-width: 600px) {
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
		.header .back {
			justify-self: end;
			text-align: right;
		}

		.preview-toggle {
			margin-left: 0;
		}
	}
</style>
