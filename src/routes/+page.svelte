<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Bars from '#lib/Bars.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
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

	const tiles = $derived([
		['Liked songs', data.overview.songs],
		['Artists', data.overview.artists],
		['Genres', data.overview.genres],
		['Analyzed', data.overview.analyzedOk]
	] as const);
</script>

{#snippet chart(title: string, rows: { label: string; count: number; href: string }[], color: string, empty?: string)}
	<Card.Root>
		<Card.Header><Card.Title>{title}</Card.Title></Card.Header>
		<Card.Content><Bars {rows} {color} {empty} /></Card.Content>
	</Card.Root>
{/snippet}

{#if !data.user}
	<Card.Root class="mx-auto mt-12 max-w-md text-center">
		<Card.Header>
			<Card.Title class="text-xl">Connect your Spotify</Card.Title>
			<Card.Description>
				Log in to pull your liked songs into the local database. Nothing leaves this machine except calls to Spotify.
			</Card.Description>
		</Card.Header>
		<Card.Footer class="justify-center">
			<Button href="/login" size="lg" data-sveltekit-reload>Log in with Spotify</Button>
		</Card.Footer>
	</Card.Root>
{:else}
	<div class="mb-6 flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Your library</h1>
			<p class="text-sm text-muted-foreground">
				Liked between {date(data.overview.first)} and {date(data.overview.last)}
				{#if data.overview.analyzed < data.overview.songs}
					· {data.overview.songs - data.overview.analyzed} songs not analyzed yet (run <code>npm run analyze</code>)
				{/if}
			</p>
		</div>
		<form method="POST" action="?/sync" use:enhance class="flex items-center gap-3">
			<span class="text-sm" role="status">
				{#if data.sync.running}
					<span class="text-muted-foreground">{data.sync.phase}: {data.sync.done} / {data.sync.total || '?'}</span>
				{:else if data.sync.error}
					<span class="text-destructive">Sync failed: {data.sync.error}</span>
				{:else if data.sync.finishedAt}
					<span class="text-muted-foreground">Synced {new Date(data.sync.finishedAt).toLocaleTimeString()}</span>
				{/if}
			</span>
			<Button type="submit" disabled={data.sync.running}>
				<RefreshCwIcon class={data.sync.running ? 'animate-spin' : ''} />
				{data.sync.running ? 'Syncing…' : 'Sync liked songs'}
			</Button>
		</form>
	</div>

	<div class="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
		{#each tiles as [label, value] (label)}
			<Card.Root size="sm">
				<Card.Content>
					<div class="text-sm text-muted-foreground">{label}</div>
					<div class="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
		<Card.Root>
			<Card.Header>
				<Card.Title>Liked per {data.by}</Card.Title>
				<Card.Action>
					<div class="flex rounded-lg bg-muted p-0.5" role="group" aria-label="Group by">
						{#each ['year', 'quarter', 'month'] as by (by)}
							<Button
								href="?by={by}"
								size="xs"
								variant={data.by === by ? 'outline' : 'ghost'}
								aria-current={data.by === by ? 'true' : undefined}
								data-sveltekit-noscroll>{by}</Button
							>
						{/each}
					</div>
				</Card.Action>
			</Card.Header>
			<Card.Content><Bars rows={data.liked.map((r) => ({ ...r, href: q({ period: r.label }) }))} /></Card.Content>
		</Card.Root>
		{@render chart('Genre families', data.families.map((r) => ({ ...r, href: q({ genre: r.label }) })), 'var(--chart-2)', NEEDS_ANALYZE)}
		{@render chart('Top genres', data.genres.map((r) => ({ ...r, href: q({ genre: r.label }) })), 'var(--chart-2)', NEEDS_ANALYZE)}
		{@render chart('Top artists', data.artists.map((r) => ({ ...r, href: q({ artist: r.id }) })), 'var(--chart-3)')}
		{@render chart(
			'BPM',
			data.bpm.map((r) => ({ label: `${r.low}–${r.low + 9}`, count: r.count, href: q({ bpm_min: String(r.low), bpm_max: String(r.low + 10) }) })),
			'var(--chart-4)',
			NEEDS_ANALYZE
		)}
		{@render chart(
			'Key (Camelot)',
			data.keys.map((r) => ({ label: `${r.camelot} · ${r.name}`, count: r.count, href: q({ key: r.camelot }) })),
			'var(--chart-5)',
			NEEDS_ANALYZE
		)}
		{@render chart(
			'Release decade',
			data.decades.map((r) => ({ label: `${r.decade}s`, count: r.count, href: q({ decade: String(r.decade) }) })),
			'var(--chart-1)'
		)}
	</div>

	<Card.Root class="mt-4">
		<Card.Header>
			<Card.Title>Taste per {data.by}</Card.Title>
			<Card.Description>Energy and mood (0% sad → 100% happy) come from ReccoBeats and only cover songs it knows.</Card.Description>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="capitalize">{data.by}</Table.Head>
						<Table.Head class="text-right">Songs</Table.Head>
						<Table.Head class="text-right">Avg BPM</Table.Head>
						<Table.Head class="text-right">Energy</Table.Head>
						<Table.Head class="text-right">Mood</Table.Head>
						<Table.Head>Top genres</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.taste as r (r.label)}
						<Table.Row>
							<Table.Cell><a class="font-medium hover:underline" href={q({ period: r.label })}>{r.label}</a></Table.Cell>
							<Table.Cell class="text-right tabular-nums">{r.songs}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{r.bpm ? Math.round(r.bpm) : '–'}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{pct(r.energy)}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">{pct(r.valence)}</Table.Cell>
							<Table.Cell>
								<div class="flex flex-wrap gap-1">
									{#each r.genres as g (g.genre)}
										<Badge variant="secondary" href={q({ period: r.label, genre: g.genre })}>
											{g.genre} <span class="opacity-60">{g.count}</span>
										</Badge>
									{/each}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
{/if}
