<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Bars from '#lib/Bars.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const q = (params: Record<string, string>) => `/songs?${new URLSearchParams(params)}`;
	const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–');

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
				{#if data.overview.artistsPending}· {data.overview.artistsPending} artists still need genres{/if}
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
			<h2>Top genres</h2>
			<Bars rows={data.genres.map((r) => ({ ...r, href: q({ genre: r.label }) }))} />
		</section>

		<section class="card">
			<h2>Top artists</h2>
			<Bars rows={data.artists.map((r) => ({ ...r, href: q({ artist: r.id }) }))} />
		</section>

		<section class="card">
			<h2>Release decade</h2>
			<Bars rows={data.decades.map((r) => ({ label: `${r.decade}s`, count: r.count, href: q({ decade: String(r.decade) }) }))} />
		</section>
	</div>
{/if}

<style>
	.chip[aria-current] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-fg);
	}
</style>
