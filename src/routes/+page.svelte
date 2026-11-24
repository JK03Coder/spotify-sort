<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Bars from '#lib/Bars.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const q = (params: Record<string, string>) => `/songs?${new URLSearchParams(params)}`;
	const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–');
	const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
	const NEEDS_ANALYZE = 'No audio analysis yet: run npm run analyze.';

	// poll while a sync runs in the background
	$effect(() => {
		if (!data.sync.running) return;
		const timer = setInterval(invalidateAll, 1500);
		return () => clearInterval(timer);
	});
</script>

{#if !data.user}
	<section class="card">
		<h1>Connect your Spotify</h1>
		<p>Log in to pull your liked songs into the local database. Nothing leaves this machine except calls to Spotify.</p>
		<a class="button primary" href="/login" data-sveltekit-reload>Log in with Spotify</a>
	</section>
{:else}
	<section class="card row" style="justify-content: space-between; margin-bottom: 1rem">
		<div>
			<strong>{data.overview.songs}</strong> liked songs ·
			<strong>{data.overview.artists}</strong> artists ·
			<strong>{data.overview.genres}</strong> genres
			<div class="muted">
				Liked between {date(data.overview.first)} and {date(data.overview.last)}
				· {data.overview.analyzedOk} songs analyzed
				{#if data.overview.analyzed < data.overview.songs}
					({data.overview.songs - data.overview.analyzed} to go: run <code>npm run analyze</code>)
				{/if}
			</div>
		</div>
		<form method="POST" action="?/sync" use:enhance class="row">
			{#if data.sync.running}
				<span class="muted">{data.sync.phase}: {data.sync.done} / {data.sync.total || '?'}</span>
			{:else if data.sync.error}
				<span class="error">Sync failed: {data.sync.error}</span>
			{:else if data.sync.finishedAt}
				<span class="muted">Synced {new Date(data.sync.finishedAt).toLocaleTimeString()}</span>
			{/if}
			<button class="primary" disabled={data.sync.running}>{data.sync.running ? 'Syncing…' : 'Sync liked songs'}</button>
		</form>
	</section>

	<div class="grid">
		<section class="card">
			<div class="row" style="justify-content: space-between">
				<h2>Liked per {data.by}</h2>
				<div class="row">
					{#each ['year', 'quarter', 'month'] as by}
						<a class="chip" href="?by={by}" aria-current={data.by === by ? 'true' : undefined}>{by}</a>
					{/each}
				</div>
			</div>
			<Bars rows={data.liked.map((r) => ({ ...r, href: q({ period: r.label }) }))} />
		</section>

		<section class="card">
			<h2>Genre families</h2>
			<Bars rows={data.families.map((r) => ({ ...r, href: q({ genre: r.label }) }))} empty={NEEDS_ANALYZE} />
		</section>

		<section class="card">
			<h2>Top genres</h2>
			<Bars rows={data.genres.map((r) => ({ ...r, href: q({ genre: r.label }) }))} empty={NEEDS_ANALYZE} />
		</section>

		<section class="card">
			<h2>Top artists</h2>
			<Bars rows={data.artists.map((r) => ({ ...r, href: q({ artist: r.id }) }))} />
		</section>

		<section class="card">
			<h2>Release decade</h2>
			<Bars rows={data.decades.map((r) => ({ label: `${r.decade}s`, count: r.count, href: q({ decade: String(r.decade) }) }))} />
		</section>

		<section class="card">
			<h2>BPM</h2>
			<Bars
				rows={data.bpm.map((r) => ({ label: `${r.low}–${r.low + 9}`, count: r.count, href: q({ bpm_min: String(r.low), bpm_max: String(r.low + 10) }) }))}
				empty={NEEDS_ANALYZE}
			/>
		</section>

		<section class="card">
			<h2>Key <span class="muted" style="font-size: 0.7em; font-weight: normal">Camelot · neighbours mix well</span></h2>
			<Bars rows={data.keys.map((r) => ({ label: `${r.camelot} · ${r.name}`, count: r.count, href: q({ key: r.camelot }) }))} empty={NEEDS_ANALYZE} />
		</section>
	</div>

	<section class="card" style="margin-top: 1rem; overflow-x: auto">
		<h2>Taste per {data.by}</h2>
		<table>
			<thead>
				<tr><th>{data.by}</th><th>Songs</th><th>Avg BPM</th><th>Energy</th><th>Mood</th><th>Top genres</th></tr>
			</thead>
			<tbody>
				{#each data.taste as r (r.label)}
					<tr>
						<td><a href={q({ period: r.label })}>{r.label}</a></td>
						<td>{r.songs}</td>
						<td>{r.bpm ? Math.round(r.bpm) : '–'}</td>
						<td>{pct(r.energy)}</td>
						<td>{pct(r.valence)}</td>
						<td class="row">
							{#each r.genres as g (g.genre)}
								<a class="chip" href={q({ period: r.label, genre: g.genre })}>{g.genre} <span class="muted">{g.count}</span></a>
							{/each}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="muted">Energy and mood (0% sad → 100% happy) come from ReccoBeats and only cover songs it knows.</p>
	</section>
{/if}

<style>
	.chip[aria-current] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
</style>
