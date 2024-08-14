import { singleContainerDeploymentTemplate } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { serviceTemplate } from "../utilities/service";
import * as pulumi from "@pulumi/pulumi";

/* ------------------------------ prerequisite ------------------------------ */

const appLabels = {
    grafana: {
        app: "grafana"
    }
}

const stack = pulumi.getStack();
const org = pulumi.getOrganization();

const stackRef = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stackRef.getOutput("NS").apply(ns => ns as string);
const GRAFANA_IMAGE = config.require("GRAFANA_IMAGE");
const HOST = config.require("HOST");

/* --------------------------------- secrets -------------------------------- */

// TODO finish configuration of Grafana

/* ------------------------------- deployments ------------------------------ */

singleContainerDeploymentTemplate(
    "grafana",
    {
        ns: NS,
        matchLabels: appLabels.grafana
    },
    {
        image: GRAFANA_IMAGE,
        env: {
            GF_SERVER_ROOT_URL: `https://${HOST}/grafana/`
        }
    }
);

/* -------------------------------- services -------------------------------- */

const grafanaService = serviceTemplate(
    "grafana",
    NS,
    [{ port: 3000 }],
    appLabels.grafana
)

/* --------------------------------- ingress -------------------------------- */

ingressTemplate(
    "grafana",
    {
        ns: NS,
        rt: "/$2",
        bp: "HTTP"
    },
    [{
        pathType: "ImplementationSpecific",
        path: "/grafana(/|$)(.*)",
        name: grafanaService.metadata.name,
        port: 3000
    }]
);