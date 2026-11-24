<script lang="ts">
	let { playlist: p }: { playlist: { spotify_id: string | null; synced_at: string | null; updated_at: string } } = $props();
</script>

{#if !p.synced_at}
	<span class="muted">Local only</span>
{:else if p.updated_at > p.synced_at}
	<span>Changed since last push</span>
{:else}
	<a href="https://open.spotify.com/playlist/{p.spotify_id}" target="_blank" rel="noreferrer">On Spotify ↗</a>
{/if}
