<script lang="ts">
	import { tick } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import PlusIcon from '@lucide/svelte/icons/plus';

	type Option = { value: string; label?: string; count?: number };
	type Props = {
		/** form field name; the value is submitted through a hidden input */
		name: string;
		value?: string;
		groups: { heading?: string; options: Option[] }[];
		id?: string;
		labelledby?: string;
		placeholder: string;
		searchPlaceholder?: string;
		/** first item that clears the value, e.g. "Any genre" */
		anyLabel?: string;
		/** allow a value that isn't in the list */
		creatable?: boolean;
		/** called after the hidden input has the new value */
		onchange?: (value: string) => void;
		class?: string;
	};
	let {
		name,
		value = $bindable(''),
		groups,
		id,
		labelledby,
		placeholder,
		searchPlaceholder = 'Search…',
		anyLabel,
		creatable = false,
		onchange,
		class: className = 'w-full'
	}: Props = $props();

	let open = $state(false);
	let search = $state('');
	const labelOf = (v: string) => groups.flatMap((g) => g.options).find((o) => o.value === v)?.label ?? v;
	const typed = $derived(search.trim());
	// "house" already matches "Electronic > House", so don't offer it as a new value
	const exists = $derived(
		groups.some((g) =>
			g.options.some((o) => {
				const l = (o.label ?? o.value).toLowerCase();
				const t = typed.toLowerCase();
				return l === t || l.endsWith(` > ${t}`);
			})
		)
	);

	async function pick(v: string) {
		value = v;
		open = false;
		search = '';
		await tick();
		onchange?.(v);
	}
</script>

<input type="hidden" {name} {value} />
<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} {id} variant="outline" class="justify-between font-normal {className}" aria-labelledby={labelledby} role="combobox">
				<span class="truncate {value ? '' : 'text-muted-foreground'}">{value ? labelOf(value) : placeholder}</span>
				<ChevronsUpDownIcon class="opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-72 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={searchPlaceholder} bind:value={search} />
			<Command.List class="max-h-80">
				<Command.Empty>Nothing found.</Command.Empty>
				{#if creatable && typed && !exists}
					<Command.Item value={typed} forceMount onSelect={() => pick(typed)}><PlusIcon />Use “{typed}”</Command.Item>
				{/if}
				{#if anyLabel}{@render item({ value: '', label: anyLabel })}{/if}
				{#each groups as g, i (g.heading ?? i)}
					<Command.Group heading={g.heading}>
						{#each g.options as o (o.value)}{@render item(o)}{/each}
					</Command.Group>
				{/each}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

{#snippet item(o: Option)}
	<!-- data-checked shows the item's built-in check -->
	<Command.Item value={o.label ?? o.value} data-checked={value === o.value} onSelect={() => pick(o.value)}>
		<span class="flex-1 truncate">{o.label ?? o.value}</span>
		{#if o.count !== undefined}<span class="text-xs text-muted-foreground tabular-nums">{o.count}</span>{/if}
	</Command.Item>
{/snippet}
