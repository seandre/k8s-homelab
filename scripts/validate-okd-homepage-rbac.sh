#!/usr/bin/env bash
set -euo pipefail

identity="system:serviceaccount:homepage-observability:homepage-k3s-reader"
oc_command=(oc)
if [[ -n "${OC_CERTIFICATE_AUTHORITY:-}" ]]; then
  oc_command+=(--certificate-authority="${OC_CERTIFICATE_AUTHORITY}")
fi

allowed=(
  "get nodes"
  "list nodes.metrics.k8s.io"
  "list deployments.apps --all-namespaces"
  "list statefulsets.apps --all-namespaces"
  "list daemonsets.apps --all-namespaces"
  "list clusteroperators.config.openshift.io"
  "get prometheuses.monitoring.coreos.com/k8s --subresource=api --namespace=openshift-monitoring"
  "create prometheuses.monitoring.coreos.com/k8s --subresource=api --namespace=openshift-monitoring"
  "update prometheuses.monitoring.coreos.com/k8s --subresource=api --namespace=openshift-monitoring"
)
denied=(
  "list secrets --all-namespaces"
  "list configmaps --all-namespaces"
  "list pods --all-namespaces"
  "get pods/log --all-namespaces"
  "create pods/exec --all-namespaces"
  "watch nodes"
  "create deployments.apps --all-namespaces"
  "update nodes"
  "patch clusteroperators.config.openshift.io"
  "delete daemonsets.apps --all-namespaces"
  "deletecollection deployments.apps --all-namespaces"
  "create prometheuses.monitoring.coreos.com --namespace=openshift-monitoring"
  "update prometheuses.monitoring.coreos.com --namespace=openshift-monitoring"
  "delete prometheuses.monitoring.coreos.com --namespace=openshift-monitoring"
)

for check in "${allowed[@]}"; do
  read -r -a args <<<"${check}"
  test "$("${oc_command[@]}" auth can-i "${args[@]}" --as="${identity}")" = yes
done
for check in "${denied[@]}"; do
  read -r -a args <<<"${check}"
  test "$("${oc_command[@]}" auth can-i "${args[@]}" --as="${identity}")" = no
done

echo "OKD homepage RBAC allow/deny matrix passed."
