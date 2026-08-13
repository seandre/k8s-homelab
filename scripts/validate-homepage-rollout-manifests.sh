#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
render_dir="$(mktemp -d)"
trap 'rm -rf "${render_dir}"' EXIT

k3s_render="${render_dir}/homepage-k3s.yaml"
okd_render="${render_dir}/homepage-okd.yaml"
preview_doc="${render_dir}/preview-deployment.yaml"
production_doc="${render_dir}/production-deployment.yaml"
production_service_doc="${render_dir}/production-service.yaml"
okd_role_doc="${render_dir}/okd-clusterrole.yaml"
okd_monitoring_binding_doc="${render_dir}/okd-monitoring-rolebinding.yaml"

kubectl kustomize "${repo_root}/kubernetes/apps/homepage-custom-preview" >"${k3s_render}"
kubectl kustomize "${repo_root}/kubernetes/clusters/okd/observability/homepage" >"${okd_render}"

extract_document() {
  local source="$1"
  local kind="$2"
  local name="$3"
  local destination="$4"
  awk -v wanted_kind="${kind}" -v wanted_name="${name}" '
    function flush_document() {
      if (document_kind == wanted_kind && document_name == wanted_name) {
        print document
        found += 1
      }
      document = ""
      document_kind = ""
      document_name = ""
    }
    $0 == "---" { flush_document(); next }
    $0 == "kind: " wanted_kind { document_kind = wanted_kind }
    $0 == "  name: " wanted_name { document_name = wanted_name }
    { document = document $0 ORS }
    END { flush_document(); if (found != 1) exit 1 }
  ' "${source}" >"${destination}"
}

extract_document "${k3s_render}" Deployment homepage-custom-preview "${preview_doc}"
extract_document "${k3s_render}" Deployment homepage-custom-production "${production_doc}"
extract_document "${k3s_render}" Service homepage-custom-production "${production_service_doc}"
extract_document "${okd_render}" ClusterRole homepage-k3s-reader "${okd_role_doc}"
extract_document "${okd_render}" RoleBinding homepage-k3s-reader-monitoring "${okd_monitoring_binding_doc}"

if grep -Eq 'home-assistant-control|action-state|homepage-indoor-actions' "${preview_doc}"; then
  echo "preview must not mount indoor-control credentials, mappings, or action state" >&2
  exit 1
fi
grep -q 'namespace: openshift-monitoring' "${okd_monitoring_binding_doc}"
grep -q 'kind: Role' "${okd_monitoring_binding_doc}"
grep -q 'name: cluster-monitoring-metrics-api' "${okd_monitoring_binding_doc}"
grep -q 'name: homepage-k3s-reader' "${okd_monitoring_binding_doc}"

grep -q 'secretName: homepage-okd-api' "${preview_doc}"
grep -q 'secretName: homepage-okd-api' "${production_doc}"
if grep -A2 'secretName: homepage-okd-api' "${preview_doc}" | grep -q 'optional: true'; then
  echo "preview OKD credentials must be required" >&2
  exit 1
fi
if grep -A2 'secretName: homepage-okd-api' "${production_doc}" | grep -q 'optional: true'; then
  echo "production OKD credentials must be required" >&2
  exit 1
fi

for required in home-assistant-control-map home-assistant-control-token action-state homepage-indoor-actions; do
  grep -q "${required}" "${production_doc}"
done

grep -A4 'selector:' "${production_service_doc}" | grep -q 'app.kubernetes.io/instance: production'

for resource in nodes deployments statefulsets daemonsets clusteroperators; do
  grep -q "${resource}" "${okd_role_doc}"
done
grep -q 'metrics.k8s.io' "${okd_role_doc}"
if grep -Eq 'secrets|configmaps|pods|create|update|patch|delete|watch' "${okd_role_doc}"; then
  echo "OKD reader role contains an unapproved resource or verb" >&2
  exit 1
fi
if ! awk '
  /^  verbs:$/ {
    sections += 1
    getline first
    getline second
    if (first != "  - get" || second != "  - list") invalid = 1
  }
  END { if (sections != 4 || invalid) exit 1 }
' "${okd_role_doc}"; then
  echo "every OKD reader rule must contain exactly get/list" >&2
  exit 1
fi

echo "Homepage preview/production and OKD RBAC manifests passed static validation."
