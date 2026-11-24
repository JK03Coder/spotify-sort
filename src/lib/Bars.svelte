<script lang="ts">
	let { rows }: { rows: { label: string; count: number; href: string }[] } = $props();
	let max = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

<ul>
	{#each rows as r (r.label)}
		<li>
			<a href={r.href}>
				<span class="label">{r.label}</span>
				<span class="bar"><span style:width="{(r.count / max) * 100}%"></span></span>
				<span class="count">{r.count}</span>
			</a>
		</li>
	{:else}
		<li class="muted">Nothing yet, run a sync first.</li>
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 420px;
		overflow-y: auto;
	}
	a {
		display: grid;
		grid-template-columns: minmax(90px, 40%) 1fr 3.5em;
		gap: 0.5rem;
		align-items: center;
		padding: 0.15rem 0.25rem;
		border-radius: 4px;
		text-decoration: none;
	}
	a:hover {
		background: var(--line);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar span {
		display: block;
		height: 0.7rem;
		border-radius: 3px;
		background: var(--accent);
	}
	.count {
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}
</style>
