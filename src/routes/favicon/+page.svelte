<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import Identicon from "$lib/components/Identicon/Identicon.svelte";
	import { generatePseudoWord } from "$lib/helpers/general.helpers.js";
	import {
		MAX_FAVICON_COLORS,
		MIN_FAVICON_COLORS,
		createFaviconArchive,
		parseFaviconParams,
		renderFaviconPngs,
		sameColors,
		sanitizeSeed,
		serializeFaviconParams,
		type FaviconShape,
		type FaviconSymetry
	} from "../../components/favicon/favicon.helpers.js";

	const GRID_SIZE = 8;
	const MASTER_PIXEL_SIZE = 8;

	let params = $state(
		parseFaviconParams($page.url.searchParams, () => generatePseudoWord(10))
	);
	let generatedColors = $state<string[]>([]);
	let masterCanvas = $state<HTMLCanvasElement | undefined>();
	let previewUrl = $state("");
	let isDownloading = $state(false);
	let downloadError = $state("");
	let downloadStatus = $state("");

	// This is comparison-only state. Keeping it outside the reactive graph stops
	// the URL effect from depending on the navigation it triggers itself.
	let lastUrl = "";

	const palette = $derived(
		params.colors.length ? params.colors : generatedColors
	);
	const seedError = $derived(
		params.seed.trim().length ? "" : "Enter a seed before downloading."
	);

	$effect(() => {
		const url = `/favicon${serializeFaviconParams(params)}`;
		if (url === lastUrl) return;

		lastUrl = url;
		goto(url, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	});

	$effect(() => {
		if (!params.seed.trim() && previewUrl) previewUrl = "";
	});

	function handleRenderedColors(colors: string[]) {
		if (!params.colors.length && !sameColors(generatedColors, colors)) {
			generatedColors = [...colors];
		}

		if (masterCanvas) {
			const nextPreview = masterCanvas.toDataURL("image/png");
			if (nextPreview !== previewUrl) previewUrl = nextPreview;
		}
	}

	function handleRandomSeed() {
		params = { ...params, seed: generatePseudoWord(10) };
		downloadError = "";
		downloadStatus = "";
	}

	function materializePalette(): string[] {
		return params.colors.length ? [...params.colors] : [...generatedColors];
	}

	function handleChangeColor(index: number, color: string) {
		const colors = materializePalette();
		if (!colors[index]) return;
		colors[index] = color;
		params = { ...params, colors, numberOfColors: colors.length };
	}

	function handleAddColor() {
		const colors = materializePalette();
		if (colors.length >= MAX_FAVICON_COLORS) return;
		colors.push(randomHex());
		params = { ...params, colors, numberOfColors: colors.length };
	}

	function handleRemoveColor() {
		const colors = materializePalette();
		if (colors.length <= MIN_FAVICON_COLORS) return;
		colors.pop();
		params = { ...params, colors, numberOfColors: colors.length };
	}

	function handleResetPalette() {
		params = { ...params, colors: [] };
	}

	function handleSymetry(symetry: FaviconSymetry) {
		params = { ...params, symetry };
	}

	function handleShape(shape: FaviconShape) {
		params = { ...params, shape };
	}

	async function handleDownload() {
		if (!masterCanvas || seedError || isDownloading) return;

		isDownloading = true;
		downloadError = "";
		downloadStatus = "";

		try {
			const pngs = await renderFaviconPngs(masterCanvas);
			const archive = createFaviconArchive(pngs);
			const archiveBuffer = archive.buffer.slice(
				archive.byteOffset,
				archive.byteOffset + archive.byteLength
			) as ArrayBuffer;
			const blob = new Blob([archiveBuffer], { type: "application/zip" });
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");

			link.download = `identicon-favicon-${sanitizeSeed(params.seed)}.zip`;
			link.href = objectUrl;
			link.click();
			URL.revokeObjectURL(objectUrl);
			downloadStatus = "Favicon pack downloaded.";
		} catch (error) {
			downloadError =
				error instanceof Error
					? error.message
					: "The favicon pack could not be created. Try another browser.";
		} finally {
			isDownloading = false;
		}
	}

	function randomHex(): string {
		return `#${Math.floor(Math.random() * 0xffffff)
			.toString(16)
			.padStart(6, "0")}`;
	}
</script>

<svelte:head>
	<title>Favicon studio | Svelte Identicons</title>
	<meta
		name="description"
		content="Create a deterministic identicon favicon and download a browser-ready icon pack."
	/>
</svelte:head>

<main class="favicon-page">
	<header class="page-header">
		<div>
			<p class="eyebrow">8 × 8 identicon tool</p>
			<h1>Favicon studio</h1>
			<p class="intro">
				Make one tiny mark that stays recognizable from a browser tab to a home
				screen.
			</p>
		</div>
		<a class="back" href="/">Back to playground</a>
	</header>

	<div class="studio">
		<section class="preview-column" aria-label="Favicon previews">
			<div class="master-stage">
				<div class="master-grid" aria-hidden="true"></div>
				<div class="master-icon" class:empty={Boolean(seedError)}>
					{#if seedError}
						<div class="master-empty">Seed required</div>
					{:else}
						<Identicon
							bind:canvasElement={masterCanvas}
							seed={params.seed}
							width={GRID_SIZE}
							height={GRID_SIZE}
							pixelSize={MASTER_PIXEL_SIZE}
							numberOfColors={params.numberOfColors}
							colors={params.colors.length ? params.colors : undefined}
							symetry={params.symetry}
							shape={params.shape}
							onColors={handleRenderedColors}
						/>
					{/if}
				</div>
				<div class="master-caption">
					<span>Master</span>
					<b>64 × 64 px</b>
				</div>
			</div>

			<div class="context-strip">
				<div class="browser-card">
					<div class="browser-top">
						<span></span><span></span><span></span>
					</div>
					<div class="browser-tab">
						{#if previewUrl}
							<img src={previewUrl} width="16" height="16" alt="" />
						{/if}
						<span>My site</span>
						<b>×</b>
					</div>
					<p>Browser tab · 16 px</p>
				</div>

				<div class="bookmark-card">
					{#if previewUrl}
						<img src={previewUrl} width="32" height="32" alt="" />
					{/if}
					<div>
						<b>My site</b>
						<span>Bookmark · 32 px</span>
					</div>
				</div>

				<div class="home-card">
					{#if previewUrl}
						<img src={previewUrl} width="72" height="72" alt="" />
					{/if}
					<span>My site</span>
					<small>Home screen · exports at 180 px</small>
				</div>
			</div>

			<div class="size-proof" aria-label="Export sizes">
				{#each [16, 32, 48] as size}
					<div class="proof-item">
						<span class="proof-canvas">
							{#if previewUrl}
								<img
									src={previewUrl}
									width={size}
									height={size}
									alt={`${size} pixel favicon preview`}
								/>
							{/if}
						</span>
						<code>{size}×{size}</code>
					</div>
				{/each}
				<div class="proof-item large">
					<span class="proof-canvas">
						{#if previewUrl}
							<img
								src={previewUrl}
								width="64"
								height="64"
								alt="180 pixel touch icon preview"
							/>
						{/if}
					</span>
					<code>180×180</code>
				</div>
				<div class="proof-item large">
					<span class="proof-canvas">
						{#if previewUrl}
							<img
								src={previewUrl}
								width="80"
								height="80"
								alt="512 pixel large icon preview"
							/>
						{/if}
					</span>
					<code>512×512</code>
				</div>
			</div>
		</section>

		<aside class="controls" aria-label="Favicon controls">
			<section class="panel">
				<div class="panel-heading">
					<h2>Identity</h2>
					<span>shared in the URL</span>
				</div>
				<label class="field" for="favicon-seed">
					<span>Seed</span>
					<div class="input-row">
						<input
							id="favicon-seed"
							type="text"
							bind:value={params.seed}
							aria-invalid={seedError ? "true" : undefined}
							aria-describedby={seedError ? "seed-error" : undefined}
							placeholder="Type any word or phrase"
						/>
						<button type="button" onclick={handleRandomSeed}>Randomize</button>
					</div>
				</label>
				{#if seedError}
					<p class="field-error" id="seed-error">{seedError}</p>
				{/if}
			</section>

			<section class="panel">
				<div class="panel-heading">
					<h2>Palette</h2>
					<span>{palette.length || params.numberOfColors} colors</span>
				</div>

				{#if palette.length}
					<div class="palette-list">
						{#each palette as color, index}
							<label class="color-row">
								<input
									type="color"
									value={color}
									oninput={(event) =>
										handleChangeColor(index, event.currentTarget.value)}
									aria-label={`Color ${index + 1}`}
								/>
								<span class="color-chip" style:background={color}></span>
								<span>Color {index + 1}</span>
								<code>{color}</code>
							</label>
						{/each}
					</div>
				{:else}
					<p class="hint">Drawing the generated palette…</p>
				{/if}

				<div class="button-row">
					<button
						type="button"
						class="compact"
						onclick={handleRemoveColor}
						disabled={palette.length <= MIN_FAVICON_COLORS}
						aria-label="Remove last color">−</button
					>
					<button
						type="button"
						class="compact"
						onclick={handleAddColor}
						disabled={palette.length >= MAX_FAVICON_COLORS}
						aria-label="Add color">+</button
					>
					<button
						type="button"
						class="ghost reset"
						onclick={handleResetPalette}
						disabled={!params.colors.length}>Reset palette</button
					>
				</div>
				<p class="hint">
					Changing the color count changes the pattern. Editing a swatch does
					not.
				</p>
			</section>

			<section class="panel option-panel">
				<fieldset>
					<legend>Symmetry</legend>
					<div class="segments">
						{#each ["axial", "central", "none"] as symetry}
							<label class:active={params.symetry === symetry}>
								<input
									type="radio"
									name="symetry"
									value={symetry}
									checked={params.symetry === symetry}
									onchange={() => handleSymetry(symetry as FaviconSymetry)}
								/>
								<span>{symetry}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend>Cell shape</legend>
					<div class="segments two">
						{#each ["square", "circle"] as shape}
							<label class:active={params.shape === shape}>
								<input
									type="radio"
									name="shape"
									value={shape}
									checked={params.shape === shape}
									onchange={() => handleShape(shape as FaviconShape)}
								/>
								<span>{shape}</span>
							</label>
						{/each}
					</div>
				</fieldset>
			</section>

			<section class="download-panel">
				<div>
					<h2>Browser-ready pack</h2>
					<p>ICO · PNG 16/32 · Apple 180 · PNG 512 · README</p>
				</div>
				<button
					type="button"
					class="download"
					onclick={handleDownload}
					disabled={Boolean(seedError) || !masterCanvas || isDownloading}
				>
					{isDownloading ? "Building pack…" : "Download .zip"}
				</button>
				<div class="download-message" aria-live="polite">
					{#if downloadError}
						<p class="download-error">{downloadError}</p>
					{:else if downloadStatus}
						<p class="download-success">{downloadStatus}</p>
					{/if}
				</div>
			</section>
		</aside>
	</div>
</main>

<style>
	.favicon-page {
		--surface: #1a1d22;
		--surface-raised: #252930;
		--line: #343a43;
		--muted: #929aa6;
		--quiet: #68717d;
		--gold: #ffd700;
		--danger: #ff9475;
		--success: #8bd58b;
		min-height: 100vh;
		padding: 28px clamp(18px, 4vw, 56px) 56px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 30px;
		max-width: 1180px;
		margin: 0 auto 28px;
	}

	.eyebrow {
		margin-bottom: 7px;
		color: var(--gold);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h1 {
		font-size: clamp(30px, 5vw, 52px);
		line-height: 0.95;
		letter-spacing: -0.055em;
	}

	.intro {
		max-width: 620px;
		margin-top: 14px;
		color: #bdc3cc;
		font-size: 15px;
		line-height: 1.55;
	}

	.back {
		flex-shrink: 0;
		color: var(--gold);
		font-size: 13px;
		text-underline-offset: 4px;
	}

	.studio {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 390px;
		align-items: start;
		gap: 24px;
		max-width: 1180px;
		margin: 0 auto;
	}

	.preview-column {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}

	.master-stage {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 430px;
		overflow: hidden;
		border: 1px solid var(--line);
		background: #17191d;
	}

	.master-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
		background-size: 32px 32px;
		mask-image: radial-gradient(circle at center, black 5%, transparent 66%);
	}

	.master-icon {
		position: relative;
		z-index: 1;
		padding: 18px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(34, 37, 43, 0.86);
		box-shadow: 18px 18px 0 rgba(0, 0, 0, 0.22);
	}

	.master-icon :global(canvas) {
		width: clamp(210px, 31vw, 292px) !important;
		height: clamp(210px, 31vw, 292px) !important;
		image-rendering: pixelated;
	}

	.master-empty {
		display: grid;
		place-items: center;
		width: clamp(210px, 31vw, 292px);
		aspect-ratio: 1;
		border: 1px dashed var(--line);
		color: var(--quiet);
		font-size: 11px;
		text-transform: uppercase;
	}

	.master-caption {
		position: absolute;
		right: 14px;
		bottom: 12px;
		display: flex;
		gap: 9px;
		color: var(--muted);
		font-size: 11px;
	}

	.master-caption b {
		color: white;
	}

	.context-strip {
		display: grid;
		grid-template-columns: 1.25fr 1fr 0.8fr;
		gap: 10px;
	}

	.browser-card,
	.bookmark-card,
	.home-card {
		min-width: 0;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.browser-top {
		display: flex;
		gap: 4px;
		padding: 7px 9px;
		border-bottom: 1px solid var(--line);
	}

	.browser-top span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--quiet);
	}

	.browser-tab {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 82%;
		margin: 8px 8px 0;
		padding: 7px 8px;
		background: var(--surface-raised);
		font-size: 11px;
	}

	.browser-tab img,
	.bookmark-card img,
	.home-card img,
	.proof-item img {
		image-rendering: pixelated;
		object-fit: contain;
	}

	.browser-tab b {
		margin-left: auto;
		color: var(--quiet);
	}

	.browser-card > p {
		padding: 10px;
		color: var(--muted);
		font-size: 10px;
	}

	.bookmark-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px;
	}

	.bookmark-card div {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 4px;
	}

	.bookmark-card b {
		font-size: 12px;
	}

	.bookmark-card span,
	.home-card small {
		color: var(--muted);
		font-size: 9px;
	}

	.home-card {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 6px;
		padding: 12px 8px 10px;
		background:
			linear-gradient(135deg, rgba(255, 215, 0, 0.09), transparent 58%),
			var(--surface);
		text-align: center;
	}

	.home-card img {
		width: 44px;
		height: 44px;
	}

	.home-card > span {
		font-size: 10px;
	}

	.size-proof {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		min-height: 116px;
		overflow-x: auto;
		padding: 10px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.proof-item {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex: 1 0 78px;
		flex-direction: column;
		gap: 8px;
	}

	.proof-item.large {
		flex-basis: 100px;
	}

	.proof-canvas {
		display: grid;
		place-items: center;
		min-width: 52px;
		min-height: 52px;
		background-image:
			linear-gradient(45deg, #2a2e35 25%, transparent 25%),
			linear-gradient(-45deg, #2a2e35 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #2a2e35 75%),
			linear-gradient(-45deg, transparent 75%, #2a2e35 75%);
		background-position:
			0 0,
			0 5px,
			5px -5px,
			-5px 0;
		background-size: 10px 10px;
	}

	.proof-item.large .proof-canvas {
		min-width: 84px;
		min-height: 84px;
	}

	.proof-item code {
		color: var(--muted);
		font-family: inherit;
		font-size: 10px;
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.panel,
	.download-panel {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.panel-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	h2,
	legend {
		color: white;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.panel-heading > span,
	.field > span,
	.hint,
	.download-panel p {
		color: var(--muted);
		font-size: 11px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.input-row,
	.button-row {
		display: flex;
		gap: 6px;
	}

	.input-row input {
		min-width: 0;
		flex: 1;
	}

	.field-error,
	.download-error {
		color: var(--danger);
		font-size: 11px;
		line-height: 1.4;
	}

	.palette-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.color-row {
		display: grid;
		grid-template-columns: 30px 14px 1fr auto;
		align-items: center;
		gap: 8px;
		min-height: 34px;
		padding-right: 8px;
		border: 1px solid var(--line);
		color: #cbd0d7;
		font-size: 11px;
	}

	.color-row input[type="color"] {
		width: 30px;
		height: 32px;
		padding: 0;
	}

	.color-chip {
		width: 11px;
		height: 11px;
		border: 1px solid rgba(255, 255, 255, 0.28);
	}

	.color-row code {
		color: var(--muted);
		font-family: inherit;
		font-size: 10px;
		user-select: all;
	}

	button.compact {
		width: 36px;
	}

	button.ghost {
		background: var(--surface-raised);
		color: #cbd0d7;
	}

	button.reset {
		margin-left: auto;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.42;
	}

	.hint {
		line-height: 1.45;
	}

	.option-panel {
		gap: 16px;
	}

	fieldset {
		min-width: 0;
		border: none;
	}

	legend {
		margin-bottom: 8px;
	}

	.segments {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--line);
	}

	.segments.two {
		grid-template-columns: repeat(2, 1fr);
	}

	.segments label {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 36px;
		border-right: 1px solid var(--line);
		color: var(--muted);
		cursor: pointer;
		font-size: 11px;
		text-transform: capitalize;
	}

	.segments label:last-child {
		border-right: none;
	}

	.segments label.active {
		background: var(--gold);
		color: #17191d;
		font-weight: 700;
	}

	.segments input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.download-panel {
		border-color: rgba(255, 215, 0, 0.6);
		background: linear-gradient(135deg, #24251d, var(--surface) 60%);
	}

	.download-panel p {
		margin-top: 5px;
		line-height: 1.45;
	}

	.download {
		width: 100%;
		height: 42px;
		font-weight: 700;
	}

	.download-message {
		min-height: 15px;
	}

	.download-success {
		color: var(--success) !important;
	}

	:global(.favicon-page button:focus-visible),
	:global(.favicon-page input:focus-visible),
	:global(.favicon-page a:focus-visible),
	.segments label:has(input:focus-visible) {
		outline: 2px solid var(--gold);
		outline-offset: 3px;
	}

	@media (max-width: 920px) {
		.studio {
			grid-template-columns: 1fr;
		}

		.controls {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.download-panel {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 640px) {
		.favicon-page {
			padding: 20px 12px 36px;
		}

		.page-header {
			flex-direction: column-reverse;
			gap: 22px;
		}

		.master-stage {
			min-height: 340px;
		}

		.master-icon {
			padding: 12px;
			box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.22);
		}

		.master-icon :global(canvas) {
			width: min(64vw, 230px) !important;
			height: min(64vw, 230px) !important;
		}

		.master-empty {
			width: min(64vw, 230px);
		}

		.context-strip {
			grid-template-columns: 1fr 1fr;
		}

		.size-proof {
			flex-wrap: wrap;
			overflow-x: visible;
		}

		.proof-item {
			flex: 1 1 82px;
		}

		.proof-item.large {
			flex-basis: 120px;
		}

		.home-card {
			grid-column: 1 / -1;
			flex-direction: row;
			justify-content: flex-start;
			padding: 10px 14px;
			text-align: left;
		}

		.home-card small {
			margin-left: auto;
		}

		.controls {
			display: flex;
		}

		.input-row {
			align-items: stretch;
			flex-direction: column;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.favicon-page button) {
			transition: none;
		}
	}
</style>
