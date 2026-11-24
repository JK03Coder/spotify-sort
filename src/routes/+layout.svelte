<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		['/', 'Stats'],
		['/songs', 'Songs'],
		['/playlists', 'Playlists']
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Spotify Sort</title>
</svelte:head>

<header>
	<strong>Spotify Sort</strong>
	<nav>
		{#each links as [href, label]}
			<a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
		{/each}
	</nav>
	{#if data.user}
		<form method="POST" action="/?/logout">
			<span class="muted">{data.user}</span>
			<button>Log out</button>
		</form>
	{:else}
		<a class="button" href="/login" data-sveltekit-reload>Log in with Spotify</a>
	{/if}
</header>

<main>
	{@render children()}
</main>

<style>
	:global {
		:root {
			--bg: #fafafa;
			--fg: #1a1a1a;
			--muted: #6b6b6b;
			--card: #fff;
			--line: #e3e3e3;
			--accent: #1db954;
			--accent-fg: #fff;
			--danger: #c62828;
			color-scheme: light dark;
		}
		@media (prefers-color-scheme: dark) {
			:root {
				--bg: #121212;
				--fg: #ededed;
				--muted: #9a9a9a;
				--card: #1c1c1c;
				--line: #2e2e2e;
				--accent-fg: #000;
			}
		}
		body {
			margin: 0;
			background: var(--bg);
			color: var(--fg);
			font: 15px/1.45 system-ui, sans-serif;
		}
		a {
			color: inherit;
		}
		h1,
		h2 {
			margin: 0 0 0.75rem;
		}
		.muted {
			color: var(--muted);
		}
		.card {
			background: var(--card);
			border: 1px solid var(--line);
			border-radius: 10px;
			padding: 1rem;
		}
		.grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
			gap: 1rem;
		}
		.row {
			display: flex;
			gap: 0.5rem;
			align-items: center;
			flex-wrap: wrap;
		}
		button,
		.button,
		input,
		select,
		textarea {
			font: inherit;
			padding: 0.4rem 0.7rem;
			border-radius: 6px;
			border: 1px solid var(--line);
			background: var(--card);
			color: var(--fg);
		}
		button,
		.button {
			cursor: pointer;
			text-decoration: none;
		}
		button.primary,
		.button.primary {
			background: var(--accent);
			border-color: var(--accent);
			color: var(--accent-fg);
		}
		button.danger {
			color: var(--danger);
		}
		button:disabled {
			opacity: 0.5;
			cursor: default;
		}
		table {
			width: 100%;
			border-collapse: collapse;
		}
		td,
		th {
			text-align: left;
			padding: 0.35rem 0.5rem;
			border-bottom: 1px solid var(--line);
			vertical-align: middle;
		}
		th {
			color: var(--muted);
			font-weight: 500;
		}
		td img {
			width: 40px;
			height: 40px;
			border-radius: 4px;
			display: block;
		}
		.chip {
			display: inline-block;
			padding: 0.15rem 0.6rem;
			border-radius: 999px;
			border: 1px solid var(--line);
			text-decoration: none;
			font-size: 0.9em;
		}
		.error {
			color: var(--danger);
		}
	}

	header {
		display: flex;
		gap: 1.5rem;
		align-items: center;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--line);
	}
	nav {
		display: flex;
		gap: 1rem;
		flex: 1;
	}
	nav a {
		text-decoration: none;
		color: var(--muted);
	}
	nav a[aria-current='page'] {
		color: var(--fg);
		font-weight: 600;
	}
	header form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
