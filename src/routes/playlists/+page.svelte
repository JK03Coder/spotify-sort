<script lang="ts">
	import SyncBadge from '#lib/SyncBadge.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>Playlists</h1>
<p class="muted">Playlists live here until you push them to Spotify. Make new ones from the <a href="/songs">Songs</a> page.</p>

<table class="card">
	<thead><tr><th>Name</th><th>Songs</th><th>Spotify</th></tr></thead>
	<tbody>
		{#each data.playlists as p (p.id)}
			<tr>
				<td><a href="/playlists/{p.id}">{p.name}</a></td>
				<td>{p.count}</td>
				<td><SyncBadge playlist={p} /></td>
			</tr>
		{:else}
			<tr><td colspan="3" class="muted">No playlists yet.</td></tr>
		{/each}
	</tbody>
</table>
