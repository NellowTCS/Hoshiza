<script lang="ts">
	import { login } from '$lib/api';
	import favicon from '$lib/assets/favicon.svg';
</script>

<section class="signin">
	<img class="logo" src={favicon} alt="" />
	<h1>Hoshiza</h1>
	<p>Sign in with GitHub to pull in every repo you own, including your orgs, and triage them.</p>
	<button class="primary" onclick={() => login()}>
		<svg class="gh" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path
				d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
			/>
		</svg>
		Sign in with GitHub
	</button>
	<small class="note">
		Read-only by default. You'll be asked to re-authorize with write access only if you enable
		GitHub sync.
	</small>
</section>

<style>
	.signin {
		max-width: 420px;
		margin: 12vh auto 0;
		padding: 44px 40px;
		text-align: center;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.logo {
		width: 48px;
		height: 48px;
	}
	h1 {
		margin: 14px 0 4px;
		font-size: 24px;
		font-weight: 600;
	}
	p {
		color: var(--text-dim);
		margin: 0 0 22px;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		padding: 8px 18px;
		font-size: 14px;
		font-weight: 600;
	}
	.gh {
		width: 18px;
		height: 18px;
	}
	.note {
		display: block;
		margin-top: 16px;
		color: var(--text-dim);
		font-size: 12.5px;
		line-height: 1.5;
	}
	@media (max-width: 767px) {
		.signin {
			margin: 8vh 16px 0;
			padding: 32px 20px;
		}
		.primary {
			width: 100%;
			padding: 12px 18px;
		}
	}
</style>
