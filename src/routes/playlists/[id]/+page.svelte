<script lang="ts">
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import SyncBadge from '#lib/SyncBadge.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button, buttonVariants } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pushing = $state(false);
	const p = $derived(data.playlist);

	// songs ticked for removal; cleared whenever the list reloads
	const songIds = $derived(data.songs.map((s) => s.id).join());
	let marked = $derived.by(() => {
		void songIds; // recreate (empty) when the songs change
		return new SvelteSet<string>();
	});
	const toggle = (id: string) => (marked.has(id) ? marked.delete(id) : marked.add(id));
</script>

<Button href="/playlists" variant="ghost" size="sm" class="mb-3 -ml-2"><ArrowLeftIcon />Playlists</Button>

<div class="mb-4 grid gap-4 md:grid-cols-[3fr_2fr]">
	<Card.Root>
		<form method="POST" action="?/save" use:enhance={() => ({ update }) => update({ reset: false })} class="contents">
			<Card.Header><Card.Title>Details</Card.Title></Card.Header>
			<Card.Content class="grid gap-3">
				<div class="grid gap-1.5">
					<Label for="name">Name</Label>
					<Input id="name" name="name" value={p.name} required />
				</div>
				<div class="grid gap-1.5">
					<Label for="description">Description</Label>
					<Textarea id="description" name="description" rows={2} value={p.description} />
				</div>
			</Card.Content>
			<Card.Footer class="pb-4"><Button type="submit" variant="secondary">Save</Button></Card.Footer>
		</form>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Spotify</Card.Title>
			<Card.Description class="flex items-center gap-2">{p.count} songs · <SyncBadge playlist={p} /></Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			<div class="flex flex-wrap gap-2">
				<form
					method="POST"
					action="?/push"
					use:enhance={() => {
						pushing = true;
						return async ({ update }) => {
							await update();
							pushing = false;
						};
					}}
				>
					<Button type="submit" disabled={pushing || !p.count}>
						<UploadIcon />{pushing ? 'Pushing…' : p.spotify_id ? 'Update on Spotify' : 'Push to Spotify'}
					</Button>
				</form>

				<AlertDialog.Root>
					<AlertDialog.Trigger class={buttonVariants({ variant: 'destructive' })}><Trash2Icon />Delete</AlertDialog.Trigger>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Delete “{p.name}”?</AlertDialog.Title>
							<AlertDialog.Description>
								This removes the playlist from this app.{#if p.spotify_id} The copy on Spotify stays.{/if}
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
							<form method="POST" action="?/delete">
								<AlertDialog.Action type="submit" class={buttonVariants({ variant: 'destructive' })}>Delete</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			</div>
			{#if p.spotify_id}
				<p class="text-xs text-muted-foreground">Pushing overwrites the Spotify copy with this list.</p>
			{/if}
			{#if form?.message}<p class="text-sm text-destructive">{form.message}</p>{/if}
		</Card.Content>
	</Card.Root>
</div>

<form method="POST" action="?/remove" use:enhance>
	<div class="mb-2 flex min-h-8 items-center justify-between">
		<h2 class="text-lg font-semibold">Songs</h2>
		{#if marked.size}
			<Button type="submit" variant="destructive" size="sm"><Trash2Icon />Remove {marked.size} selected</Button>
		{/if}
	</div>
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
				<!-- plain rows/cells with the shadcn table classes (lighter than a component per cell) -->
				{#each data.songs as s (s.id)}
					<tr class="border-b transition-colors hover:bg-muted/50 cursor-pointer select-none {marked.has(s.id) ? 'bg-destructive/8 hover:bg-destructive/12' : ''}" onclick={() => toggle(s.id)}>
						<td class="p-2 align-middle whitespace-nowrap pr-0">
							<input
								type="checkbox"
								name="track"
								value={s.id}
								checked={marked.has(s.id)}
								aria-label="Select {s.name} for removal"
								class="check"
								onclick={(e) => {
									e.stopPropagation();
									toggle(s.id);
								}}
							/>
						</td>
						<td class="p-2 align-middle whitespace-nowrap">{#if s.album_image}<img src={s.album_image} alt="" loading="lazy" class="size-10 rounded-md" />{/if}</td>
						<td class="p-2 align-middle whitespace-nowrap max-w-64 whitespace-normal">
							<div class="truncate font-medium">{s.name}</div>
							<div class="truncate text-muted-foreground">{s.artists}</div>
						</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground md:table-cell">{s.genre ?? ''}</td>
						<td class="p-2 align-middle whitespace-nowrap text-right text-muted-foreground tabular-nums">{s.bpm ? Math.round(s.bpm) : ''}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground sm:table-cell" title={s.key ? `${s.key} ${s.scale}` : ''}>{s.camelot ?? ''}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground tabular-nums lg:table-cell">{s.release_date}</td>
						<td class="p-2 align-middle whitespace-nowrap hidden text-muted-foreground tabular-nums lg:table-cell">{s.added_at ? new Date(s.added_at).toLocaleDateString() : 'unliked'}</td>
					</tr>
				{:else}
					<Table.Row><Table.Cell colspan={8} class="py-8 text-center text-muted-foreground">This playlist is empty.</Table.Cell></Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Card.Root>
</form>
