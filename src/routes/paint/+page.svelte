<script lang="ts">
	import { browser } from "$app/environment";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import PaintGrid from "../../components/paint/PaintGrid.svelte";
	import { tick } from "svelte";
	import {
		buildPalette,
		colorCells,
		extractGrid,
		findDuplicateColors,
		generateSeed,
		layoutKey,
		measure,
		parsePaintParams,
		randomHex,
		round,
		serializePaintParams,
		type PaintParams,
		type PaletteEntry
	} from "../../components/paint/paint.helpers.js";

	let params: PaintParams = parsePaintParams($page.url.searchParams);

	let painted: boolean[] = [];
	let loadedKey = "";
	let activeColor: string | null = null;
	// Position in the current color's list of squares. -1 = not started.
	let stepIndex = -1;
	let stepList: HTMLElement;
	let cellPx = 20;
	let canvasWidthCm = 60;
	let canvasHeightCm = 60;
	let marginCm = 0;
	let showHowTo = false;
	let verifyStatus = "";

	// Runs during SSR too: extractGrid falls back to a stub canvas, and the
	// engine fills imageData before it ever asks for a 2d context.
	$: extraction = extractGrid(params);
	$: grid = extraction.grid;
	$: engineColors = extraction.colors;
	$: palette = buildPalette(grid, extraction.backgroundColor);
	$: baseEntry = palette.find((entry) => entry.isBase);
	$: toPaint = palette
		.filter((entry) => !entry.isBase)
		.reduce((acc, entry) => acc + entry.count, 0);
	$: duplicates = findDuplicateColors(engineColors);

	$: key = layoutKey(params);
	$: if (browser && key !== loadedKey) {
		painted = loadProgress(key, params.width * params.height);
		loadedKey = key;
	}

	$: if (browser) {
		goto(serializePaintParams(params), {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}

	// Removing a color slot (or anything else that redraws the palette) can leave
	// the isolated color with no cells at all, which dims the whole grid and
	// selects nothing. Fall back to the reference view instead.
	$: if (
		activeColor !== null &&
		palette.length &&
		!palette.some((entry) => entry.color === activeColor)
	) {
		activeColor = null;
		stepIndex = -1;
	}

	$: activeEntry = palette.find((entry) => entry.color === activeColor);
	$: steps =
		activeColor && !activeEntry?.isBase
			? colorCells(grid, params.width, activeColor)
			: [];
	$: currentStep = stepIndex >= 0 ? steps[stepIndex] ?? null : null;
	// The grid still lifts the whole row, so you keep your place on the canvas
	// while the ring marks the exact square.
	$: focusRow = currentStep?.row ?? null;
	$: focusIndex = currentStep?.index ?? null;
	$: measurements = measure({
		canvasWidthCm,
		canvasHeightCm,
		marginCm,
		width: params.width,
		height: params.height
	});

	$: paintedCount = (entry: PaletteEntry) => {
		let count = 0;
		for (let i = 0; i < grid.length; i++) {
			if (grid[i] === entry.color && painted[i]) count++;
		}
		return count;
	};

	$: totalPainted = palette
		.filter((entry) => !entry.isBase)
		.reduce((acc, entry) => acc + paintedCount(entry), 0);

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
		painted = painted;
		saveProgress();
	}

	function setPainted(index: number, value: boolean) {
		painted[index] = value;
		painted = painted;
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
		if (activeColor === entry.color) {
			activeColor = value;
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

	function handleSelectColor(color: string | null) {
		activeColor = color;
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

		if (stepIndex >= 0) {
			setPainted(steps[stepIndex].index, false);
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

	let previewCanvas: HTMLCanvasElement;
</script>

<svelte:head>
	<title>Paint mode | {params.seed}</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<main class="page">
	<header class="header">
		<h1>Paint mode</h1>
		<p class="sub">
			{params.width}x{params.height} &middot; seed <b>{params.seed}</b>
		</p>
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
						numberOfColors={params.numberOfColors}
						colors={params.colors.length ? params.colors : undefined}
						text={params.text || undefined}
						textColor={params.textColor}
						textPosition={params.textPosition}
						onColors={undefined}
					/>
					<div class="preview-meta">
						<p>{grid.length} cells</p>
						<p><b>{toPaint}</b> to paint</p>
						<p class="muted">{grid.length - toPaint} covered by the base coat</p>
					</div>
				</div>
				<div class="row">
					<input type="text" bind:value={params.seed} placeholder="Seed" />
					<button on:click={handleGenerateSeed}>Random</button>
				</div>
				<div class="row">
					<button class="ghost" on:click={() => handleVerify(previewCanvas)}>
						Check grid matches canvas
					</button>
					{#if verifyStatus}
						<span
							class="verify"
							class:bad={!verifyStatus.startsWith("all")}
						>
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

				{#each palette as entry}
					{@const editable = engineColors.indexOf(entry.color) !== -1}
					<div class="paint-row" class:selected={activeColor === entry.color}>
						<button
							class="swatch"
							style="background:{entry.color}"
							title="Isolate {entry.label}"
							on:click={() => handleSelectColor(entry.color)}
						/>
						<span class="tag">{entry.label}</span>
						{#if editable}
							<input
								type="color"
								value={entry.color}
								on:input={(e) =>
									handleChangeColor(entry, e.currentTarget.value)}
							/>
						{:else}
							<span class="tag muted">text</span>
						{/if}
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
					<button on:click={handleRemoveColor}>-</button>
					<button on:click={handleAddColor}>+</button>
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
						on:click={() => handleSelectColor(null)}>All</button
					>
					{#each palette as entry}
						<button
							class="chip"
							class:on={activeColor === entry.color}
							on:click={() => handleSelectColor(entry.color)}
						>
							<span class="dot" style="background:{entry.color}" />
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
							/>
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
						<div class="bar"><span style="width:{(totalPainted / toPaint) * 100}%" /></div>
						<p>Overall: {totalPainted} / {toPaint} cells</p>
					</div>
				{/if}

				<div class="row">
					<label class="zoom">
						Zoom
						<input type="range" min="8" max="44" bind:value={cellPx} />
					</label>
					<button class="ghost" on:click={handleResetProgress}>Reset</button>
				</div>
			</section>

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
						<button on:click={goPreviousStep} disabled={stepIndex < 0}>&lt;</button>
						<button on:click={goNextStep}>
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
								<button on:click={() => goToStep(i)}>
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
				<h2>Canvas</h2>
				<div class="row">
					<span class="tag">W</span>
					<input type="number" bind:value={canvasWidthCm} min="1" />
					<span class="tag">H</span>
					<input type="number" bind:value={canvasHeightCm} min="1" />
					<span class="tag">margin</span>
					<input type="number" bind:value={marginCm} min="0" />
					<span class="tag muted">cm</span>
				</div>
				<dl class="measures">
					<dt>Cell</dt>
					<dd>
						{round(measurements.cellWidthMm, 2)} x {round(
							measurements.cellHeightMm,
							2
						)} mm
					</dd>
					<dt>Every 5th</dt>
					<dd>
						{round(measurements.blockWidthMm, 2)} x {round(
							measurements.blockHeightMm,
							2
						)} mm
					</dd>
				</dl>
				{#each measurements.warnings as warning}
					<p class="warning">{warning}</p>
				{/each}
			</section>

			<section class="panel">
				<button class="howto-toggle" on:click={() => (showHowTo = !showHowTo)}>
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
							Tick every cell along all four edges, then rule the every-5th lines
							harder. A miscount stays trapped in one 5x5 block.
						</li>
						{#if params.symetry === "axial"}
							<li>
								The pattern is mirrored down the dashed line, so you only have to
								read {Math.ceil(params.width / 2)} columns.
							</li>
						{/if}
						<li>
							Paint one color per session, biggest count first. Pick a color
							above to hide everything else, then tap cells off as you go.
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
		margin-left: auto;
		color: gold;
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
	.row input[type="number"] {
		min-width: 0;
		flex: 1;
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
</style>
