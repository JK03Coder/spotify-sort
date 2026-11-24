<script lang="ts">
	import SyncBadge from '#lib/SyncBadge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import ListPlusIcon from '@lucide/svelte/icons/list-plus';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold">Playlists</h1>
		<p class="text-sm text-muted-foreground">Playlists live here until you push them to Spotify.</p>
	</div>
	<Button href="/songs"><ListPlusIcon />New from songs</Button>
</div>

<Card.Root class="py-0">
	<Table.Root>
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				<Table.Head>Name</Table.Head>
				<Table.Head class="text-right">Songs</Table.Head>
				<Table.Head>Spotify</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.playlists as p (p.id)}
				<Table.Row>
					<Table.Cell><a class="font-medium underline-offset-4 hover:underline" href="/playlists/{p.id}">{p.name}</a></Table.Cell>
					<Table.Cell class="text-right tabular-nums">{p.count}</Table.Cell>
					<Table.Cell><SyncBadge playlist={p} /></Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={3} class="py-8 text-center text-muted-foreground">
						No playlists yet. Pick songs on the <a class="text-primary underline-offset-4 hover:underline" href="/songs">Songs</a> page.
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</Card.Root>
