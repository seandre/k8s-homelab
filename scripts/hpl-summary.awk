function value_or(value, fallback) {
  return value == "" ? fallback : value
}

function commify(value, string, head) {
  string = sprintf("%.0f", value)
  if (length(string) <= 3) {
    return string
  }
  head = length(string) % 3
  if (head == 0) {
    head = 3
  }
  return substr(string, 1, head) comma_groups(substr(string, head + 1))
}

function comma_groups(string, output) {
  output = ""
  while (length(string) > 0) {
    output = output "," substr(string, 1, 3)
    string = substr(string, 4)
  }
  return output
}

function duration(seconds, hours, minutes, remainder) {
  hours = int(seconds / 3600)
  minutes = int((seconds - hours * 3600) / 60)
  remainder = seconds - hours * 3600 - minutes * 60
  if (hours > 0) {
    return sprintf("%dh %dm %.2fs", hours, minutes, remainder)
  }
  return sprintf("%dm %.2fs", minutes, remainder)
}

/^top500_benchmark_revision=/ {
  revision = $0
  sub(/^[^=]*=/, "", revision)
}
/^profile=/ {
  profile = $0
  sub(/^[^=]*=/, "", profile)
}
/^mode=/ {
  mode = $0
  sub(/^[^=]*=/, "", mode)
}
/^build_root=/ {
  build_root = $0
  sub(/^[^=]*=/, "", build_root)
}
/^started_utc=/ {
  wrapper_started = $0
  sub(/^[^=]*=/, "", wrapper_started)
}
/^finished_utc=/ {
  wrapper_finished = $0
  sub(/^[^=]*=/, "", wrapper_finished)
}
/^upstream_exit_status=/ {
  upstream_status = $0
  sub(/^[^=]*=/, "", upstream_status)
}

{
  for (result_field = 1; result_field <= NF - 6; result_field++) {
    candidate_variant = $(result_field)
    sub(/^"/, "", candidate_variant)
    if (candidate_variant ~ /^W/ && $(result_field + 1) ~ /^[0-9]+$/ && \
        $(result_field + 2) ~ /^[0-9]+$/ && $(result_field + 3) ~ /^[0-9]+$/ && \
        $(result_field + 4) ~ /^[0-9]+$/) {
      variant = candidate_variant
      matrix_n = $(result_field + 1) + 0
      block_size = $(result_field + 2) + 0
      process_p = $(result_field + 3) + 0
      process_q = $(result_field + 4) + 0
      solve_seconds = $(result_field + 5) + 0
      gflops = $(result_field + 6) + 0
      have_result = 1
    }
  }
}

/^HPL_pdgesv\(\) start time/ {
  hpl_started = $0
  sub(/^HPL_pdgesv\(\) start time[[:space:]]*/, "", hpl_started)
}
/^HPL_pdgesv\(\) end time/ {
  hpl_finished = $0
  sub(/^HPL_pdgesv\(\) end time[[:space:]]*/, "", hpl_finished)
}
/^\|\|Ax-b\|\|_oo/ {
  residual = $0
  sub(/^.*=[[:space:]]*/, "", residual)
  split(residual, residual_parts, /[[:space:]]+/)
  residual_value = residual_parts[1]
  residual_status = $NF
}

END {
  if (have_result) {
    outcome = residual_status == "PASSED" && upstream_status == "0" ? "PASS" : "FAIL"
  } else {
    outcome = upstream_status == "0" ? "NO RESULT" : "INCOMPLETE"
  }

  print "# HPL Benchmark Summary"
  print ""
  printf "| Metric | Value |\n"
  printf "|---|---:|\n"
  printf "| Outcome | **%s** |\n", outcome

  if (have_result) {
    ranks = process_p * process_q
    matrix_gib = 8 * matrix_n * matrix_n / 1024 / 1024 / 1024
    printf "| Performance | **%.3f GFLOPS** |\n", gflops
    printf "| Performance per MPI rank | %.3f GFLOPS |\n", gflops / ranks
    printf "| Solve time | %s (%.2f seconds) |\n", duration(solve_seconds), solve_seconds
    printf "| Matrix order (`N`) | %s |\n", commify(matrix_n)
    printf "| Block size (`NB`) | %s |\n", commify(block_size)
    printf "| Process grid | %d x %d |\n", process_p, process_q
    printf "| MPI ranks | %d |\n", ranks
    printf "| Approximate matrix storage | %.2f GiB |\n", matrix_gib
    printf "| Scaled residual | `%s` |\n", value_or(residual_value, "not found")
    printf "| Residual check | **%s** (threshold `< 16.0`) |\n", value_or(residual_status, "UNKNOWN")
    printf "| HPL variant | `%s` |\n", variant
  } else {
    printf "| HPL result | No completed result row was found |\n"
    printf "| Upstream exit status | `%s` |\n", value_or(upstream_status, "missing")
  }

  print ""
  print "## Run details"
  print ""
  printf "- Profile: `%s`\n", value_or(profile, "unknown")
  printf "- Mode: `%s`\n", value_or(mode, "unknown")
  printf "- Hosts: %s\n", value_or(hosts, "unknown")
  printf "- Upstream revision: `%s`\n", value_or(revision, "unknown")
  printf "- Remote build: `%s`\n", value_or(build_root, "unknown")
  printf "- Wrapper started: `%s`\n", value_or(wrapper_started, "unknown")
  printf "- Wrapper finished: `%s`\n", value_or(wrapper_finished, "unknown")
  if (have_result) {
    printf "- HPL started: `%s`\n", value_or(hpl_started, "unknown")
    printf "- HPL finished: `%s`\n", value_or(hpl_finished, "unknown")
  }
  printf "- Raw output: [%s](./%s)\n", raw_log, raw_log

  if (upstream_status == "0" && !have_result) {
    exit 2
  }
}
