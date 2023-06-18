<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { IdenticonOptions } from '$lib/components/Identicon/Identicon.js';
	import Identicon from '$lib/components/Identicon/Identicon.svelte';
	import { generatePseudoWord } from '$lib/helpers/general.helpers.js';
	import IdenticonItem, { type Params } from './IdenticonItem.svelte';
	import './global.css';

	let params: Params = parseParams($page.url.searchParams);
	let prevParams: Params | undefined = undefined;
	let history: Params[] = [];
	let canvasElement: HTMLCanvasElement;

	$: saveParams(params);

	function parseParams(params: URLSearchParams): Params {
		return {
			seed: params.get('seed') || generateSeed(),
			text: params.get('text') || '',
			numberOfColors: parseInt(params.get('numberOfColors') || '2'),
			height: parseInt(params.get('height') || '10'),
			width: parseInt(params.get('width') || '10'),
			pixelSize: parseInt(params.get('pixelSize') || '10'),
			colors: params.get('colors')?.length ? params.get('colors')!.split(',') : [],
			symetry: (params.get('symetry') || 'axial') as IdenticonOptions['symetry'],
			textColor: '#ffffff'
		};
	}

	function createUrl(params: Params): string {
		const newQueryParams = new URLSearchParams({
			seed: params.seed,
			text: params.text,
			numberOfColors: params.colors.length ? '' : params.numberOfColors.toString(),
			height: params.height?.toString() || '1',
			width: params.width?.toString() || '1',
			symetry: params.symetry as string,
			colors: params.colors.join(','),
			textColor: params.textColor
		});
		return `?${newQueryParams.toString()}`;
	}

	function saveParams(...p: any) {
		if (prevParams) {
			history = [prevParams, ...history].slice(0, 10);
		}

		const newQueryParamsString = createUrl(params);

		if (browser) {
			goto(`${newQueryParamsString}`, { keepFocus: true, noScroll: true });
		}

		prevParams = structuredClone(params);
	}

	function generateSeed() {
		return generatePseudoWord(10);
	}

	function handleDownload() {
		var link = document.createElement('a');
		link.download = 'filename.png';
		link.href = canvasElement.toDataURL();
		link.click();
	}

	async function handleCopyLink(params: Params) {
		await navigator.clipboard.writeText(window.location.origin + '/' + createUrl(params));
		window.alert('Url copied!');
	}

	function handleAddColor() {
		if (!params.colors.length) {
			params = {
				...params,
				colors: ['#ffffff', '#000000']
			};
			return;
		}
		params = {
			...params,
			colors: [...params.colors, '#000000']
		};
	}

	function handleChangeColor(index: number, e: any) {
		if (!params.colors) {
			return;
		}
		params = {
			...params,
			colors: params.colors.map((c, i) => (i === index ? e.target!.value : c))
		};
	}

	function handleChangeTextColor(e: any) {
		params = {
			...params,
			textColor: e.target.value
		};
	}

	function handleRemoveColor(index: number) {
		if (!params.colors) {
			return;
		}

		if (params.colors.length === 2) {
			params = {
				...params,
				colors: []
			};
			return;
		}

		params = {
			...params,
			colors: params.colors.filter((c, i) => i !== index)
		};
	}

	function handleChangeInputNumber(e: Event, key: keyof Params) {
		const target = e.target as HTMLInputElement;
		const value = target.valueAsNumber;
		if (isNaN(value)) {
			return;
		}
		params = {
			...params,
			[key]: value
		};
	}
</script>

<main>
	<div class="logo">
		<Identicon
			seed={params.seed}
			height={14}
			width={80}
			pixelSize={10}
			numberOfColors={2}
			symetry="central"
			text="svelte-identicons"
			textBackgroundColor="main"
			textColor="#ffffff"
			textPadding={2}
			textPosition="center"
		/>
	</div>

	<div class="filters">
		<div class="filters-top">
			<div class="fieldset seed">
				<label class="input-field">
					<p>Seed</p>
					<input type="text" bind:value={params.seed} placeholder="Seed" />
				</label>
				<button
					on:click={() => {
						params = {
							...params,
							seed: generateSeed()
						};
					}}
				>
					Generate
				</button>
			</div>
		</div>

		{#if !params.colors.length}
			<div class="fieldset">
				<label class="input-field">
					<p>Number of colors</p>
					<input
						type="number"
						value={params.numberOfColors}
						min="2"
						max="10"
						on:input={(e) => handleChangeInputNumber(e, 'numberOfColors')}
					/>
				</label>
			</div>
		{/if}

		<div class="fieldset fieldset-colors">
			<p>Custom colors</p>
			{#if params.colors}
				<div class="colors">
					{#each params.colors as color, i}
						<div class="color">
							<p>{color}</p>
							<input
								type="color"
								id="head"
								name="head"
								value={color}
								on:change={(e) => handleChangeColor(i, e)}
							/>
							<button on:click={() => handleRemoveColor(i)}>Remove</button>
						</div>
					{/each}
				</div>
			{/if}
			<button on:click={handleAddColor}>Add</button>
		</div>

		<div class="fieldsets-row">
			<div class="fieldset">
				<label class="input-field">
					<p>Height</p>
					<input
						type="number"
						value={params.height}
						min="1"
						max="100"
						on:input={(e) => handleChangeInputNumber(e, 'height')}
					/>
					<!-- <input type="range" bind:value={params.height} min="1" max="500" /> -->
				</label>
			</div>

			<div class="fieldset">
				<label class="input-field">
					<p>Width</p>
					<input
						type="number"
						value={params.width}
						min="1"
						max="100"
						on:input={(e) => handleChangeInputNumber(e, 'width')}
					/>
					<!-- <input type="range" bind:value={params.width} min="1" max="500" /> -->
				</label>
			</div>

			<div class="fieldset">
				<label class="input-field">
					<p>Pixel size</p>
					<input
						type="number"
						value={params.pixelSize}
						min="1"
						max="100"
						on:input={(e) => handleChangeInputNumber(e, 'pixelSize')}
					/>
					<!-- <input type="range" bind:value={params.pixelSize} min="1" max="100" /> -->
				</label>
			</div>
		</div>

		<div class="fieldsets-row">
			<div class="fieldset">
				<label class="input-field">
					<p>Text</p>
					<input type="text" bind:value={params.text} />
					<input
						type="color"
						id="head"
						name="head"
						value={params.textColor}
						on:change={handleChangeTextColor}
					/>
				</label>
			</div>

			<div class="fieldset fieldset-radio">
				<p>Symetry</p>
				<div>
					<label class="radio">
						<input type="radio" bind:group={params.symetry} name="symetry" value="axial" />
						<p>Axial</p>
					</label>

					<label class="radio">
						<input
							id="symetry-central"
							type="radio"
							bind:group={params.symetry}
							name="symetry"
							value="central"
						/>
						<p>Central</p>
					</label>
				</div>
			</div>
		</div>
	</div>

	<div class="item">
		<IdenticonItem {params} />
	</div>

	{#if history.length}
		<div class="history">
			<h2>History</h2>
			{#each history as params}
				<div class="item">
					<IdenticonItem {params} />
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	main {
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 50px;
		width: 800px;
		margin: 40px auto;
	}

	.filters {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
		width: 100%;
	}

	.fieldset {
		display: flex;
		border: none;
		border: 1px solid white;
		align-items: center;
		height: fit-content;
		padding: 0 0 0 10px;
		justify-content: space-between;
	}

	.fieldset button {
		margin-left: auto;
	}

	.fieldset label > p {
		font-size: 16px;
		position: relative;
		padding-right: 10px;
		top: 1px;
	}

	.input-field {
		display: flex;
		flex: 1;
	}
	.input-field p {
		display: flex;
		align-items: center;
	}
	.input-field input:first-of-type {
		flex: 1;
	}

	.fieldsets-row {
		display: flex;
		gap: 14px;
	}
	.fieldsets-row .fieldset {
		flex: 1;
	}

	.fieldset-radio > div {
		display: flex;
		gap: 20px;
		margin-right: 10px;
	}

	label.radio {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.colors {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 10px auto;
	}

	.color {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.history {
		display: flex;
		align-items: center;
		flex-direction: column;
		gap: 30px;
		margin-top: 50px;
	}
</style>
