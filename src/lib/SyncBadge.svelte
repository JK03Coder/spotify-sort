<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';

	let { playlist: p }: { playlist: { spotify_id: string | null; synced_at: string | null; updated_at: string } } = $props();
</script>

{#if !p.synced_at}
	<Badge variant="outline">Local only</Badge>
{:else if p.updated_at > p.synced_at}
	<Badge variant="secondary">Changed since push</Badge>
{:else}
	<Badge href="https://open.spotify.com/playlist/{p.spotify_id}" target="_blank" rel="noreferrer">On Spotify ↗</Badge>
{/if}
