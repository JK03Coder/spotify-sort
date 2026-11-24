<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import Combobox from '#lib/Combobox.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ListPlusIcon from '@lucide/svelte/icons/list-plus';
	import BanIcon from '@lucide/svelte/icons/ban';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { NO_GENRE } from '#lib/genres.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// --- filters ---

	let filterForm = $state<HTMLFormElement>();
	// dropdown values, kept in sync with the URL; '' means "any"
	let genre = $derived(data.filter.genre ?? '');
	let decade = $derived(data.filter.decade !== undefined ? String(data.filter.decade) : '');
	let key = $derived(data.filter.key ?? '');
	let period = $derived(data.filter.period ?? '');

	const withParam = (k: string, v: string) => {
		const p = new URLSearchParams(page.url.search);
		p.set(k, v);
		return `?${p}`;
	};
	const without = (k: string) => {
		const p = new URLSearchParams(page.url.search);
		p.delete(k);
		return `?${p}`;
	};
	function applyFilters(e: SubmitEvent) {
		e.preventDefault();
		const params = new URLSearchParams();
		for (const [k, v] of new FormData(e.currentTarget as HTMLFormElement)) {
			if (String(v).trim()) params.set(k, String(v).trim());
		}
		goto(`?${params}`, { reset: false }); // keep scroll + focus while tweaking filters
	}
	// dropdowns aren't native inputs, so submit after their hidden input has updated
	const submitFilters = () => tick().then(() => filterForm?.requestSubmit());

	let activeFilters = $derived(
		[
			['period', data.filter.period],
			['genre', data.filter.genre],
			['artist', data.artistName ?? data.filter.artist],
			['decade', data.filter.decade !== undefined ? `${data.filter.decade}s` : undefined],
			['q', data.filter.q && `“${data.filter.q}”`],
			['bpm_min', data.filter.bpmMin !== undefined ? `≥ ${data.filter.bpmMin} BPM` : undefined],
			['bpm_max', data.filter.bpmMax !== undefined ? `< ${data.filter.bpmMax} BPM` : undefined],
			['key', data.filter.key]
		].filter(([, v]) => v) as [string, string][]
	);

	// form actions keep the filters in the URL, so the list stays the same after submitting
	const act = (name: string) => `${page.url.search ? `${page.url.search}&` : '?'}/${name}`;

	// --- selection: everything in the current filter starts selected, and resets only when the list itself changes ---

	const songIds = $derived(data.songs.map((s) => s.id).join());
	let selected = $derived(new SvelteSet(songIds ? songIds.split(',') : []));
	const allSelected = $derived(data.songs.length > 0 && selected.size === data.songs.length);
	let lastClicked = -1;

	function toggle(i: number, shift: boolean) {
		const on = !selected.has(data.songs[i].id);
		// shift-click selects (or clears) the whole range since the last click
		const [from, to] = shift && lastClicked >= 0 ? [Math.min(lastClicked, i), Math.max(lastClicked, i)] : [i, i];
		for (let j = from; j <= to; j++) {
			if (on) selected.add(data.songs[j].id);
			else selected.delete(data.songs[j].id);
		}
		lastClicked = i;
	}
	function toggleAll() {
		if (allSelected) selected.clear();
		else for (const s of data.songs) selected.add(s.id);
	}

	// --- destination ---

	let target = $state('new'); // 'new' or a playlist id; kept while you change filters
	const suggestedName = $derived(activeFilters.map(([, v]) => v).join(' · ') || 'All liked songs');
	let name = $derived(suggestedName);
	const targetPlaylist = $derived(data.playlists.find((p) => String(p.id) === target));
	const inTarget = $derived(new Set(data.memberships.filter((m) => String(m.playlist_id) === target).map((m) => m.track_id)));
	const newCount = $derived(target === 'new' ? selected.size : [...selected].filter((id) => !inTarget.has(id)).length);
	let saving = $state(false);

	const filteredGenre = $derived(data.filter.genre !== NO_GENRE ? data.filter.genre : undefined);
	const rejectLabel = $derived(filteredGenre ? `Not ${filteredGenre}` : 'Not their current genre');
	const manualSelected = $derived(data.songs.some((s) => s.manual && selected.has(s.id)));

	const plural = (n: number) => `${n} song${n === 1 ? '' : 's'}`;
	const buttonLabel = $derived.by(() => {
		if (!selected.size) return 'Select songs to add';
		if (target === 'new') return `Create playlist with ${plural(selected.size)}`;
		if (!newCount) return 'Already in this playlist';
		return `Add ${plural(newCount)}`;
	});
	const decadeLabel = $derived(decade ? `${decade}s` : 'Any decade');
	const keyLabel = $derived(data.options.keys.find((k) => k.camelot === key)?.camelot ?? 'Any key');
</script>

<Card.Root class="mb-3">
	<Card.Content>
		<form bind:this={filterForm} class="grid grid-cols-2 gap-3 md:grid-cols-[2fr_1fr_1.4fr_1fr_1.3fr_1fr_auto] md:items-end" onsubmit={applyFilters} onchange={(e) => e.currentTarget.requestSubmit()}>
			<div class="col-span-2 grid gap-1.5 md:col-span-1">
				<Label for="q">Search</Label>
				<div class="relative">
					<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input id="q" type="search" name="q" placeholder="Song, artist or album" value={data.filter.q ?? ''} class="pl-8" />
				</div>
			</div>

			<div class="grid gap-1.5">
				<Label id="period-label">Liked in</Label>
				<Combobox name="period" bind:value={period} groups={data.options.periods} labelledby="period-label" placeholder="Any time" anyLabel="Any time" searchPlaceholder="2023, 2023-Q3, 2023-07…" onchange={submitFilters} />
			</div>

			<div class="grid gap-1.5">
				<Label id="genre-label">Genre</Label>
				<Combobox
					name="genre"
					bind:value={genre}
					groups={[
						{ options: [{ value: NO_GENRE, count: data.options.noGenre }] },
						{ heading: 'Families', options: data.options.families.map((g) => ({ value: g.label, count: g.count })) },
						{ heading: 'Genres', options: data.options.genres.map((g) => ({ value: g.label, count: g.count })) }
					]}
					labelledby="genre-label"
					placeholder="Any genre"
					anyLabel="Any genre"
					searchPlaceholder="Search genres…"
					onchange={submitFilters}
				/>
			</div>

			<div class="grid gap-1.5">
				<Label id="decade-label">Released</Label>
				<input type="hidden" name="decade" value={decade} />
				<Select.Root type="single" bind:value={decade} onValueChange={submitFilters}>
					<Select.Trigger class="w-full" aria-labelledby="decade-label">{decadeLabel}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="Any decade" />
						{#each data.options.decades as d (d.decade)}
							<Select.Item value={String(d.decade)} label="{d.decade}s">{d.decade}s <span class="ml-auto text-muted-foreground">{d.count}</span></Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<fieldset class="grid gap-1.5">
				<legend class="mb-1.5 text-sm leading-none font-medium">BPM</legend>
				<div class="flex items-center gap-1">
					<Input type="number" name="bpm_min" min="0" max="300" placeholder="min" aria-label="BPM from" value={data.filter.bpmMin ?? ''} class="px-2 [appearance:textfield]" />
					<span class="text-muted-foreground" aria-hidden="true">–</span>
					<Input type="number" name="bpm_max" min="0" max="300" placeholder="max" aria-label="BPM to" value={data.filter.bpmMax ?? ''} class="px-2 [appearance:textfield]" />
				</div>
			</fieldset>

			<div class="grid gap-1.5">
				<Label id="key-label">Key</Label>
				<input type="hidden" name="key" value={key} />
				<Select.Root type="single" bind:value={key} onValueChange={submitFilters}>
					<Select.Trigger class="w-full" aria-labelledby="key-label">{keyLabel}</Select.Trigger>
					<Select.Content>
						<Select.Item value="" label="Any key" />
						{#each data.options.keys as k (k.camelot)}
							<Select.Item value={k.camelot} label={k.camelot}>
								<span class="w-8 font-medium">{k.camelot}</span>{k.name}<span class="ml-auto text-muted-foreground">{k.count}</span>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if data.filter.artist}<input type="hidden" name="artist" value={data.filter.artist} />{/if}
			<Button type="submit" variant="secondary">Apply</Button>
		</form>
	</Card.Content>
</Card.Root>

{#if activeFilters.length || data.genres.length}
	<div class="mb-3 flex flex-wrap items-center gap-1.5">
		{#each activeFilters as [k, label] (k)}
			<Badge href={without(k)} aria-label="Remove filter {k}: {label}">{label}<XIcon /></Badge>
		{/each}
		{#if activeFilters.length}<Button href="/songs" variant="link" size="xs">Clear all</Button>{/if}
		{#if data.genres.length}
			<span class="ml-1 text-sm text-muted-foreground">Narrow by genre:</span>
			{#each data.genres.filter((g) => g.label !== data.filter.genre) as g (g.label)}
				<Badge variant="outline" href={withParam('genre', g.label)}>{g.label} <span class="text-muted-foreground">{g.count}</span></Badge>
			{/each}
		{/if}
	</div>
{/if}

<form
	method="POST"
	action={act('add')}
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			// stay on the page: refresh playlists + memberships, keep the typed name
			await update({ reset: false });
			if (result.type === 'success' && result.data?.playlist) target = String((result.data.playlist as { id: number }).id);
			saving = false;
		};
	}}
>
	<input type="hidden" name="target" value={target} />

	<Card.Root class="sticky top-15 z-10 mb-3 shadow-lg shadow-primary/5">
		<Card.Content class="grid gap-3">
			<div class="flex flex-wrap items-end gap-3">
				<label class="mr-auto flex cursor-pointer items-center gap-2 self-center text-sm">
					<Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onCheckedChange={toggleAll} disabled={!data.songs.length} />
					<span><strong class="tabular-nums">{selected.size}</strong> of {data.songs.length} selected</span>
				</label>

				<div class="grid gap-1.5">
					<Label id="target-label">Add to</Label>
					<Select.Root type="single" bind:value={target}>
						<Select.Trigger class="w-56" aria-labelledby="target-label">
							<span class="truncate">{targetPlaylist?.name ?? '＋ New playlist'}</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="new" label="＋ New playlist" />
							{#if data.playlists.length}
								<Select.Group>
									<Select.GroupHeading>Your playlists</Select.GroupHeading>
									{#each data.playlists as p (p.id)}
										<Select.Item value={String(p.id)} label={p.name}>
											<span class="truncate">{p.name}</span><span class="ml-auto text-muted-foreground">{p.count}</span>
										</Select.Item>
									{/each}
								</Select.Group>
							{/if}
						</Select.Content>
					</Select.Root>
				</div>
				{#if target === 'new'}
					<div class="grid gap-1.5">
						<Label for="playlist-name">Name</Label>
						<Input id="playlist-name" name="name" bind:value={name} required placeholder="Playlist name" class="w-56" />
					</div>
				{/if}
				<Button type="submit" disabled={saving || !newCount}><ListPlusIcon />{saving ? 'Saving…' : buttonLabel}</Button>
			</div>

			<p class="min-h-5 text-sm" role="status">
				{#if form?.message}
					<span class="text-destructive">{form.message}</span>
				{:else if form?.genreSet}
					<CircleCheckIcon class="mr-1 inline size-4 text-primary" />Set {plural(form.genreSet.count)} to
					<strong>{form.genreSet.genre}</strong> <span class="text-muted-foreground">({form.genreSet.family})</span>.
				{:else if form?.genreRejected}
					{@const r = form.genreRejected}
					<CircleCheckIcon class="mr-1 inline size-4 text-primary" />Removed {r.genre ? `“${r.genre}”` : 'the current genre'} from {plural(r.count)}; they now show
					their next-best detected genre.
					{#if r.noGenre}
						{plural(r.noGenre)} had nothing else:
						<a class="text-primary underline-offset-4 hover:underline" href="?genre={encodeURIComponent(NO_GENRE)}">see songs with no genre →</a>
					{/if}
				{:else if form?.genreReset !== undefined}
					<CircleCheckIcon class="mr-1 inline size-4 text-primary" />{plural(form.genreReset)} back to the detected genre.
				{:else if form?.playlist}
					<CircleCheckIcon class="mr-1 inline size-4 text-primary" />{form.playlist.created ? 'Created' : 'Added to'}
					<a class="font-medium underline-offset-4 hover:underline" href="/playlists/{form.playlist.id}">{form.playlist.name}</a>:
					{plural(form.added ?? 0)} added{#if form.skipped}, {form.skipped} already there{/if}.
					<a class="text-primary underline-offset-4 hover:underline" href="/playlists/{form.playlist.id}">Open playlist →</a>
				{:else if targetPlaylist && selected.size > newCount}
					<span class="text-muted-foreground">{selected.size - newCount} of the selected songs are already in “{targetPlaylist.name}”.</span>
				{:else}
					<span class="text-muted-foreground">Click a row to select it, shift-click to select a range.</span>
				{/if}
			</p>

			<Collapsible.Root>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="sm" class="-ml-2 text-muted-foreground">
							<PencilIcon />Fix genre of selected songs<ChevronDownIcon class="transition-transform in-data-[state=open]:rotate-180" />
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content class="grid gap-3 pt-2">
					<div class="flex flex-wrap items-center gap-2">
						<!-- formnovalidate: the new-playlist name is required for adding, not for these -->
						<Button type="submit" variant="secondary" formaction={act('rejectGenre')} formnovalidate disabled={saving || !selected.size}>
							<BanIcon />{rejectLabel}
						</Button>
						<span class="text-xs text-muted-foreground">Not sure what they are? This drops the wrong genre and falls back to the next-best one.</span>
					</div>
					<div class="flex flex-wrap items-end gap-2">
						<div class="grid gap-1.5">
							<Label id="genre-fix-label">Genre</Label>
							<Combobox
								id="genre-fix"
								name="genre"
								groups={[{ options: data.options.genreChoices.map((g) => ({ value: g })) }]}
								labelledby="genre-fix-label"
								placeholder="Pick or type a genre"
								searchPlaceholder="Deep House, or Electronic > Footwork"
								creatable
								class="w-80"
							/>
						</div>
						<Button type="submit" variant="secondary" formaction={act('setGenre')} formnovalidate disabled={saving || !selected.size}>
							Set genre of {plural(selected.size)}
						</Button>
						{#if manualSelected}
							<Button type="submit" variant="ghost" formaction={act('resetGenre')} formnovalidate disabled={saving}>Reset to detected</Button>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">
						Or pick the right genre, or type a new one as “Family &gt; Genre”. Changes are marked with a pencil and survive re-analysis.
					</p>
				</Collapsible.Content>
			</Collapsible.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root class="py-0">
		<Table.Root>
			<Table.Header>
				<Table.Row class="hover:bg-transparent">
					<Table.Head class="w-10"><span class="sr-only">Select</span></Table.Head>
					<Table.Head class="w-12"></Table.Head>
					<Table.Head>Song</Table.Head>
					<Table.Head class="hidden md:table-cell">Genre</Table.Head>
					<Table.Head class="text-right">BPM</Table.Head>
					<Table.Head class="hidden sm:table-cell">Key</Table.Head>
					<Table.Head class="hidden lg:table-cell">Released</Table.Head>
					<Table.Head class="hidden lg:table-cell">Liked</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				<!-- plain rows/cells with the shadcn table classes: 1800+ component instances made the full list slow -->
				{#each data.songs as s, i (s.id)}
					<tr class="border-b transition-colors hover:bg-muted/50 cursor-pointer select-none {selected.has(s.id) ? 'bg-primary/8 hover:bg-primary/12' : ''}" onclick={(e) => toggle(i, e.shiftKey)}>
						<td class="p-2 align-middle whitespace-nowrap pr-0">
							<input
								type="checkbox"
								name="track"
								value={s.id}
								checked={selected.has(s.id)}
								aria-label="Select {s.name}"
								class="check"
								onclick={(e) => {
									e.stopPropagation();
									toggle(i, e.shiftKey);
								}}
							/>
						</td>
						<td class="p-2 align-middle whitespace-nowrap">{#if s.album_image}<img src={s.album_image} alt="" loading="lazy" class="size-10 rounded-md" />{/if}</td>
						<td class="p-2 align-middle whitespace-nowrap max-w-64 whitespace-normal">
							<div class="flex items-center gap-1.5 font-medium">
								<span class="truncate">{s.name}</span>
								{#if inTarget.has(s.id)}<Badge variant="secondary" class="shrink-0">in playlist</Badge>{/if}
							</div>
							<div class="truncate text-muted-foreground">{s.artists}</div>
						</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground md:table-cell">
							{s.genre ?? ''}{#if s.manual}<PencilIcon class="ml-1 inline size-3" aria-hidden="true" /><span class="sr-only">(changed by hand)</span>{/if}
						</td>
						<td class="p-2 align-middle whitespace-nowrap text-right text-muted-foreground tabular-nums">{s.bpm ? Math.round(s.bpm) : ''}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground sm:table-cell" title={s.key ? `${s.key} ${s.scale}` : ''}>{s.camelot ?? ''}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground tabular-nums lg:table-cell">{s.release_date}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground tabular-nums lg:table-cell">{new Date(s.added_at).toLocaleDateString()}</td>
					</tr>
				{:else}
					<Table.Row><Table.Cell colspan={8} class="py-8 text-center text-muted-foreground">No songs match these filters.</Table.Cell></Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</form>
