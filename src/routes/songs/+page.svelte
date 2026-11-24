<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let tableForm = $state<HTMLFormElement>();
	// every song starts selected; resets when the filter changes
	let selected = $derived(data.songs.length);
	const recount = () => (selected = tableForm?.querySelectorAll('input[name=track]:checked').length ?? 0);
	function selectAll(on: boolean) {
		tableForm?.querySelectorAll<HTMLInputElement>('input[name=track]').forEach((c) => (c.checked = on));
		recount();
	}
	const withParam = (key: string, value: string) => {
		const p = new URLSearchParams(page.url.search);
		p.set(key, value);
		return `?${p}`;
	};
	const without = (key: string) => {
		const p = new URLSearchParams(page.url.search);
		p.delete(key);
		return `?${p}`;
	};
	// keep the filters in the action URL so a validation error re-renders the same list
	const action = (name: string) => `${page.url.search ? page.url.search + '&' : '?'}/${name}`;

	let activeFilters = $derived(
		[
			['period', data.filter.period],
			['genre', data.filter.genre],
			['artist', data.artistName ?? data.filter.artist],
			['decade', data.filter.decade !== undefined ? `${data.filter.decade}s` : undefined],
			['q', data.filter.q && `“${data.filter.q}”`]
		].filter(([, v]) => v) as [string, string][]
	);
	const suggestedName = $derived(activeFilters.map(([, v]) => v).join(' · ') || 'All liked songs');
</script>

<form class="card row" style="margin-bottom: 1rem">
	<input name="q" placeholder="Search song, artist, album" value={data.filter.q ?? ''} />
	<input name="period" placeholder="2023, 2023-Q3 or 2023-07" value={data.filter.period ?? ''} size="18" />
	<input name="genre" placeholder="Genre" value={data.filter.genre ?? ''} />
	<input name="decade" placeholder="Decade e.g. 1990" value={data.filter.decade ?? ''} size="12" />
	{#if data.filter.artist}<input type="hidden" name="artist" value={data.filter.artist} />{/if}
	<button>Filter</button>
	<a href="/songs" class="muted">Clear</a>
</form>

{#if activeFilters.length}
	<p class="row">
		Filtered by
		{#each activeFilters as [key, label]}
			<a class="chip" href={without(key)} title="Remove filter">{key}: {label} ✕</a>
		{/each}
	</p>
{/if}

{#if data.genres.length}
	<p class="row">
		<span class="muted">Genres in this selection:</span>
		{#each data.genres as g}
			<a class="chip" href={withParam('genre', g.label)}>{g.label} <span class="muted">{g.count}</span></a>
		{/each}
	</p>
{/if}

<form method="POST" bind:this={tableForm} onchange={recount}>
	<div class="card row" style="position: sticky; top: 0; z-index: 1; margin-bottom: 1rem">
		<span><strong>{selected}</strong> of {data.songs.length} selected</span>
		<button type="button" onclick={() => selectAll(true)}>All</button>
		<button type="button" onclick={() => selectAll(false)}>None</button>
		<span style="flex: 1"></span>
		<input name="name" placeholder="New playlist name" value={suggestedName} />
		<button class="primary" formaction={action('create')} disabled={!selected}>Create playlist</button>
		{#if data.playlists.length}
			<select name="playlist" aria-label="Existing playlist">
				{#each data.playlists as p}<option value={p.id}>{p.name}</option>{/each}
			</select>
			<button formaction={action('add')} disabled={!selected}>Add to playlist</button>
		{/if}
		{#if form?.message}<span class="error">{form.message}</span>{/if}
	</div>

	<table>
		<thead>
			<tr><th></th><th></th><th>Song</th><th>Album</th><th>Released</th><th>Liked</th></tr>
		</thead>
		<tbody>
			{#each data.songs as s (s.id)}
				<tr>
					<td><input type="checkbox" name="track" value={s.id} checked aria-label="Select {s.name}" /></td>
					<td>{#if s.album_image}<img src={s.album_image} alt="" loading="lazy" />{/if}</td>
					<td>{s.name}<div class="muted">{s.artists}</div></td>
					<td class="muted">{s.album_name}</td>
					<td class="muted">{s.release_date}</td>
					<td class="muted">{new Date(s.added_at).toLocaleDateString()}</td>
				</tr>
			{:else}
				<tr><td colspan="6" class="muted">No songs match. Synced yet? Check the Stats page.</td></tr>
			{/each}
		</tbody>
	</table>
</form>
