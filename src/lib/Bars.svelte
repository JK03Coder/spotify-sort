<script lang="ts">
	let {
		rows,
		empty = 'Nothing yet, run a sync first.',
		color = 'var(--chart-1)'
	}: { rows: { label: string; count: number; href: string }[]; empty?: string; color?: string } = $props();
	let max = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

<ul class="-mx-2 max-h-96 overflow-y-auto">
	{#each rows as r (r.label)}
		<li>
			<a
				href={r.href}
				class="grid grid-cols-[minmax(6rem,40%)_1fr_3rem] items-center gap-3 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted"
			>
				<span class="truncate">{r.label}</span>
				<span class="h-2 overflow-hidden rounded-full bg-muted">
					<span class="block h-full rounded-full" style:width="{(r.count / max) * 100}%" style:background={color}></span>
				</span>
				<span class="text-right text-muted-foreground tabular-nums">{r.count}</span>
			</a>
		</li>
	{:else}
		<li class="px-2 text-sm text-muted-foreground">{empty}</li>
	{/each}
</ul>
