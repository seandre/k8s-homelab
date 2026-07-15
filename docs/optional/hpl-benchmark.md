# Top500 HPL Benchmark Before OKD

This optional benchmark compares the three running k3s VMs with the three Ryzen systems before OKD overwrites the Ryzen disks. The homelab code is a thin wrapper around the current [`geerlingguy/top500-benchmark`](https://github.com/geerlingguy/top500-benchmark) playbook.

The wrapper updates upstream only when explicitly requested. It records the exact `master` commit and uses that same revision for both profiles, so a later upstream change cannot silently alter one side of the comparison. Skipping this benchmark does not block the OKD build.

## Prerequisites

All six benchmark hosts must run Ubuntu 20.04 or newer, be reachable as SSH user `sean`, and allow Ansible to use sudo. Inventory names must match each machine's short hostname. Install the Ansible collections referenced by upstream once:

```bash
ansible-galaxy collection install -r ansible/requirements.yml
```

The k3s profile expects these assigned logical CPUs:

| Host | Logical CPUs |
|---|---:|
| `k8s-control-01` | 2 |
| `k8s-worker-01` | 4 |
| `k8s-worker-02` | 4 |

The bare-metal profile expects 12 SMT threads on each of `okd-cp-01`, `okd-cp-02`, and `okd-cp-03`, for 36 ranks total. Keep SMT enabled and align firmware and memory settings across the Ryzen systems.

Ubuntu 26.04 provides classic sudo as `/usr/bin/sudo.ws`; the benchmark inventory already selects it for these hosts. The complete workflow prompts once for the become password unless `sean` has passwordless sudo.

## Select an Upstream Revision

From the repository root, fetch the latest upstream `master` deliberately:

```bash
scripts/hpl-benchmark update
```

This stores an ignored checkout and its exact selected SHA under `.cache/top500-benchmark/`. Benchmark commands never fetch or move that revision. Run `update` again only when both profiles should move to newer upstream code.

Each revision builds in its own remote directory:

```text
/opt/top500/builds/<full-upstream-sha>
```

Old builds remain available until they are removed manually.

## Run Both Profiles

Run the complete upstream setup, persistent inter-node SSH configuration, and benchmark for k3s:

```bash
scripts/hpl-benchmark k3s
```

Then run the complete workflow for the Ryzen systems using the same selected SHA:

```bash
scripts/hpl-benchmark baremetal
```

The wrapper validates SSH fact gathering, the exact three-host overlay, hostnames, Ubuntu support, logical CPU counts, and `P x Q` before invoking upstream. It uses one Ansible fork for the shared-host VMs and three for bare metal.

The profiles retain upstream behavior:

- MPICH, OpenBLAS, and HPL are installed and compiled by upstream.
- Compilation uses native x86 tuning flags.
- k3s uses 10 ranks, a `2 x 5` grid, and 30 GiB aggregate benchmark memory.
- Bare metal uses all 36 SMT threads, a `6 x 6` grid, and fact-derived memory sizing.
- Upstream creates persistent RSA keys and `/etc/hosts` entries for inter-node MPI.
- The CPU governor may remain set to `performance`.
- k3s stays running during the VM benchmark.
- Upstream performs one HPL run and prints its raw result.

## Rerun Only HPL

After a successful complete workflow, rerun only the upstream benchmark without rebuilding or reconfiguring SSH:

```bash
scripts/hpl-benchmark k3s benchmark
scripts/hpl-benchmark baremetal benchmark
```

These commands use the selected revision and its revision-specific build. They fail with an instruction to run `update` if no revision has been selected.

## Compare Results

Every invocation writes a raw log here:

```text
benchmark-results/<UTC-timestamp>-<short-sha>/<profile>.log
```

The header records the full upstream SHA, profile, mode, remote build root, and exact preflight and upstream commands. The footer records the upstream exit status. Ansible writes directly to this file; when launched from an interactive terminal, a separate `tail` process mirrors it for live progress without putting the benchmark behind a fragile output pipe. The directory is ignored by Git.

Find the HPL result rows and residual checks in both logs:

```bash
rg -n -A2 'Gflops|PASSED|FAILED' benchmark-results/*/*.log
```

The scientific-notation value in the `Gflops` column is the headline result. Compare only logs with the same full upstream SHA. The totals describe the capability of different systems; they do not isolate virtualization overhead.

Do not let OKD overwrite the Ryzen disks until the intended bare-metal log contains a passing residual and a valid GFLOPS result, and the logs have been backed up somewhere durable.
