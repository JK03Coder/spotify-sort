<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const links = [
		['/', 'Stats'],
		['/songs', 'Songs'],
		['/playlists', 'Playlists']
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Spotify Sort</title>
</svelte:head>

<header class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
	<div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
		<a href="/" class="flex items-center gap-2 font-semibold tracking-tight">
			<span class="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
				<AudioLinesIcon class="size-4" />
			</span>
			Spotify Sort
		</a>
		<nav class="flex flex-1 gap-1">
			{#each links as [href, label] (href)}
				<Button {href} size="sm" variant={active(href) ? 'secondary' : 'ghost'} aria-current={active(href) ? 'page' : undefined}>
					{label}
				</Button>
			{/each}
		</nav>
		{#if data.user}
			<form method="POST" action="/?/logout" class="flex items-center gap-2">
				<span class="text-sm text-muted-foreground">{data.user}</span>
				<Button type="submit" variant="ghost" size="sm"><LogOutIcon />Log out</Button>
			</form>
		{:else}
			<Button href="/login" size="sm" data-sveltekit-reload>Log in with Spotify</Button>
		{/if}
	</div>
</header>

<main class="mx-auto max-w-6xl px-4 py-6">
	{@render children()}
</main>
