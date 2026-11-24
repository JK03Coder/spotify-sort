<script lang="ts">
	import { enhance } from '$app/forms';
	import SyncBadge from '#lib/SyncBadge.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pushing = $state(false);
	const p = $derived(data.playlist);
</script>

<p><a href="/playlists" class="muted">← Playlists</a></p>

<div class="grid" style="margin-bottom: 1rem">
	<form method="POST" action="?/save" use:enhance class="card">
		<label>Name<br /><input name="name" value={p.name} style="width: 100%; box-sizing: border-box" /></label>
		<label>Description<br /><textarea name="description" rows="2" style="width: 100%; box-sizing: border-box">{p.description}</textarea></label>
		<button>Save</button>
	</form>

	<div class="card">
		<p>{p.count} songs · <SyncBadge playlist={p} /></p>
		<div class="row">
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
				<button class="primary" disabled={pushing || !p.count}>
					{pushing ? 'Pushing…' : p.spotify_id ? 'Update on Spotify' : 'Push to Spotify'}
				</button>
			</form>
			<form method="POST" action="?/delete" onsubmit={(e) => confirm(`Delete “${p.name}” locally?`) || e.preventDefault()}>
				<button class="danger">Delete</button>
			</form>
		</div>
		{#if p.spotify_id}
			<p class="muted">Pushing overwrites the Spotify copy with this list. Deleting here keeps the Spotify copy.</p>
		{/if}
		{#if form?.message}<p class="error">{form.message}</p>{/if}
	</div>
</div>

<form method="POST" action="?/remove" use:enhance>
	<table>
		<thead>
			<tr><th></th><th></th><th>Song</th><th>Album</th><th>Released</th><th>Liked</th></tr>
		</thead>
		<tbody>
			{#each data.songs as s (s.id)}
				<tr>
					<td><input type="checkbox" name="track" value={s.id} aria-label="Select {s.name}" /></td>
					<td>{#if s.album_image}<img src={s.album_image} alt="" loading="lazy" />{/if}</td>
					<td>{s.name}<div class="muted">{s.artists}</div></td>
					<td class="muted">{s.album_name}</td>
					<td class="muted">{s.release_date}</td>
					<td class="muted">{s.added_at ? new Date(s.added_at).toLocaleDateString() : 'unliked'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if data.songs.length}<p><button class="danger">Remove selected</button></p>{/if}
</form>
