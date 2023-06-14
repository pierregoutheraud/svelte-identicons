<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { IdenticonOptions } from '$lib/components/Identicon/Identicon.js';
	import { generatePseudoWord } from '$lib/helpers/general.helpers.js';
	import IdenticonItem, { type Params } from './IdenticonItem.svelte';

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
			goto(`${newQueryParamsString}`, { keepFocus: true });
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
	<div class="filters">
		<fieldset>
			<legend>Seed</legend>
			<label>
				<input bind:value={params.seed} />
				<button
					on:click={() => {
						params = {
							...params,
							seed: generateSeed()
						};
					}}>Generate</button
				>
			</label>
		</fieldset>

		<fieldset>
			<legend>Colors</legend>
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
						<button on:click={() => handleRemoveColor(i)}>-</button>
					</div>
				{/each}
				<button on:click={handleAddColor}>+</button>
			</div>
		</fieldset>

		{#if !params.colors.length}
			<fieldset>
				<legend>Number of colors</legend>
				<label>
					<input
						type="number"
						value={params.numberOfColors}
						min="2"
						max="10"
						on:input={(e) => handleChangeInputNumber(e, 'numberOfColors')}
					/>
					<input type="range" bind:value={params.numberOfColors} min="2" max="10" />
				</label>
			</fieldset>
		{/if}

		<fieldset>
			<legend>text</legend>
			<label>
				<input bind:value={params.text} />
				<!-- <input type="color" id="head" name="head" bind:value={params.textColor} /> -->
				<input
					type="color"
					id="head"
					name="head"
					value={params.textColor}
					on:change={handleChangeTextColor}
				/>
			</label>
		</fieldset>

		<fieldset>
			<legend>Height</legend>
			<label>
				<input
					type="number"
					value={params.height}
					min="1"
					max="100"
					on:input={(e) => handleChangeInputNumber(e, 'height')}
				/>
				<input type="range" bind:value={params.height} min="1" max="500" />
			</label>
		</fieldset>

		<fieldset>
			<legend>Width</legend>
			<label>
				<input
					type="number"
					value={params.width}
					min="1"
					max="100"
					on:input={(e) => handleChangeInputNumber(e, 'width')}
				/>
				<input type="range" bind:value={params.width} min="1" max="500" />
			</label>
		</fieldset>

		<fieldset>
			<legend>Pixel size</legend>
			<label>
				<input
					type="number"
					value={params.pixelSize}
					min="1"
					max="100"
					on:input={(e) => handleChangeInputNumber(e, 'pixelSize')}
				/>
				<input type="range" bind:value={params.pixelSize} min="1" max="100" />
			</label>
		</fieldset>

		<fieldset>
			<legend>Symetry</legend>

			<div>
				<label for="symetry-axial">Axial</label>
				<input
					id="symetry-axial"
					type="radio"
					bind:group={params.symetry}
					name="symetry"
					value="axial"
				/>
			</div>

			<div>
				<label for="symetry-central">Central</label>
				<input
					id="symetry-central"
					type="radio"
					bind:group={params.symetry}
					name="symetry"
					value="central"
				/>
			</div>
		</fieldset>
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
		flex-direction: column;
		gap: 30px;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
	}

	.colors {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.color {
		display: flex;
	}

	label {
		display: flex;
		flex-direction: column;
	}

	input {
		font-size: 16px;
		padding: 5px;
		width: 300px;
	}

	.history {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
</style>
