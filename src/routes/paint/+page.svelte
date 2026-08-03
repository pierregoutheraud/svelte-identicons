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

	// Must stay $state initialised once from the URL. It must NEVER become
	// $derived(parsePaintParams(page.url.searchParams)): the effect below calls
	// goto() with a URL built from this, so deriving it from the URL turns that
	// effect into an infinite navigation loop.
	let params = $state<PaintParams>(parsePaintParams($page.url.searchParams));

	let painted = $state<boolean[]>([]);
	// What the user picked. All writes go here; `activeColor` below is the value
	// actually valid against the current palette.
	let selectedColor = $state<string | null>(null);
	// Position in the current color's list of squares. -1 = not started.
	let stepIndex = $state(-1);
	let stepList = $state<HTMLElement | undefined>();
	let cellPx = $state(20);
	let squareCm = $state(2);
	let canvasWidthCm = $state(60);
	let canvasHeightCm = $state(60);
	let showHowTo = $state(false);
	let verifyStatus = $state("");

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
	});

	$effect(() => {
		const url = serializePaintParams(params);

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

	function handleChangeGridSize(key: "width" | "height", event: Event) {
		const value = (event.target as HTMLInputElement).valueAsNumber;

		if (!Number.isFinite(value) || value < 1) {
			return;
		}

		// Grid dimensions feed the PRNG, so this redraws the pattern. layoutKey
		// picks the change up and swaps in that pattern's own progress.
		params = { ...params, [key]: value };
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
				<h2>Identicon</h2>
				<div class="row">
					<span class="tag">W</span>
					<input
						type="number"
						min="1"
						max="100"
						value={params.width}
						oninput={(e) => handleChangeGridSize("width", e)}
					/>
					<span class="tag">H</span>
					<input
						type="number"
						min="1"
						max="100"
						value={params.height}
						oninput={(e) => handleChangeGridSize("height", e)}
					/>
					<span class="tag muted">squares</span>
				</div>
				<div class="row">
					<span class="tag">Square</span>
					<input
						type="number"
						bind:value={squareCm}
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
				<div class="row">
					<span class="tag">W</span>
					<input type="number" bind:value={canvasWidthCm} min="1" />
					<span class="tag">H</span>
					<input type="number" bind:value={canvasHeightCm} min="1" />
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
							Tick every cell along all four edges, then rule the every-5th
							lines harder. A miscount stays trapped in one 5x5 block.
						</li>
						{#if params.symetry === "axial"}
							<li>
								The pattern is mirrored down the dashed line, so you only have
								to read {Math.ceil(params.width / 2)} columns.
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
</style>
