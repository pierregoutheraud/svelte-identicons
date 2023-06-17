![identicons-2](https://i.imgur.com/42ZD3FG.png)
![identicons-1](https://i.imgur.com/bqjb4yW.png)

# Demo

[Demo](https://svelte-identicons.vercel.app/)

# Install

`yarn add svelte-identicons`

# Display identicon

```typescript
<script lang="ts">
  import { Identicon } from 'svelte-identicons';
</script>

<Identicon
  seed="your-seed"
  height={10}
  width={10}
  pixelSize={10}
  numberOfColors={2}
  symetry="central"
  text={undefined}
  textColor="#ffffff"
/>
```
