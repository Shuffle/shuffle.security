// @ts-nocheck
/* eslint-disable */
// Ported from RunWorkflow.jsx. See FormInputStubs.tsx for missing-feature notes.
/* eslint-disable react/no-multi-comp */
import React, {useState, useEffect, useContext} from 'react';
import {
  ArrowLeft as ArrowBackIcon,
  ArrowRight as ArrowForwardIcon,
  CheckCircle2 as CheckCircleIcon,
  Copy as ContentCopyIcon,
  Activity as DirectionsRunIcon,
  Pencil as EditIcon,
  FileText as DescriptionIcon,
  AlertCircle as ErrorIcon,
  Lock as LockIcon,
  Unlock as LockOpenIcon,
  ExternalLink as OpenInNewIcon,
  Pause as PauseIcon,
  Workflow as PolylineIcon,
  Eye as PreviewIcon
} from 'lucide-react';

import { ReactJson, green, yellow, red, grey, CodeHandler, Img, OuterLink, validateJson, collapseField, GetIconInfo, useInterval, getTheme, Context } from "../components/stubs";
import { isMobile } from "react-device-detect";
import { useNavigate, Link, useParams } from "@/lib/router-compat";
import EditWorkflow from "../components/EditWorkflow";
import RecentWorkflow from "../components/RecentWorkflow";
import { toast } from "react-toastify";
import Markdown from "react-markdown";
import { shuffleFetch, getShuffleCoreWorkflowUrl } from "../api";
import { navigateToShuffleCore } from "@/lib/authHandoff";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
// SECURITY: raw HTML is intentionally NOT enabled (no rehype-raw). Do not add it.
// react-markdown v9 already drops raw HTML tags; rehype-sanitize below is
// defense-in-depth in case the AST ever contains HTML nodes (e.g. via a plugin).
const rehypeRaw: any = undefined;
const markdownSanitizeSchema: any = {
    ...defaultSchema,
    // Strict URL scheme allowlist — blocks javascript:, data:, vbscript:, file:, etc.
    protocols: {
        ...(defaultSchema.protocols || {}),
        href: ["http", "https", "mailto", "tel"],
        src: ["http", "https"],
        cite: ["http", "https"],
    },
    // Drop any tag that could execute script or exfiltrate: iframe, script,
    // object, embed, form, input, style, link, meta, base, svg, math, etc.
    tagNames: (defaultSchema.tagNames || []).filter(
        (t: string) => !["iframe", "script", "style", "object", "embed", "form", "input", "button", "textarea", "select", "option", "link", "meta", "base", "svg", "math"].includes(t)
    ),
    // Strip event handlers and dangerous attrs across the board.
    attributes: {
        ...(defaultSchema.attributes || {}),
        "*": ((defaultSchema.attributes || {})["*"] || []).filter(
            (a: any) => {
                const name = Array.isArray(a) ? a[0] : a;
                return typeof name === "string" && !name.toLowerCase().startsWith("on");
            }
        ),
    },
};

import {
  	Tooltip,
  	Fade,
	Select,
	IconButton,
	CircularProgress, 
	TextField, 
	Button, 
	ButtonGroup, 
	Paper, 
	Typography,
	Divider,

	Dialog,
	DialogTitle,
	DialogContent,
	MenuItem,
    Autocomplete,
} from '@mui/material';

const hrefStyle = {
	color: "white", 
	textDecoration: "none"
}


const FormInput = (defaultprops: any) => {
  const { globalUrl, userdata, isLoaded, isLoggedIn, setIsLoggedIn, setCookie, register, serverside } = defaultprops;
  const { themeMode, brandColor } = useContext(Context);
  const theme = getTheme(themeMode, brandColor);

  const { supportEmail } = useContext(Context);
  let navigate = useNavigate();
  const [_, setUpdate] = useState(""); // Used to force rendring, don't remove
  const [explorerUi, setExplorerUi] = useState(false)
  const [message, setMessage] = useState("");
  const [workflow, setWorkflow] = React.useState({});
  const [executionRequest, setExecutionRequest] = React.useState({});
  const [executionArgument, setExecutionArgument] = useState("");
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionData, setExecutionData] = React.useState({});
  const [executionRunning, setExecutionRunning] = useState(false);
  const [disableButtons, setDisableButtons] = useState(false);
  const [workflowQuestion, setWorkflowQuestion] = useState("");
  const [selectedOrganization, setSelectedOrganization] = React.useState(undefined);
  const [apps, setApps] = React.useState([]);
  const [buttonClicked, setButtonClicked] = React.useState("");
  const [foundSourcenode, setFoundSourcenode] = React.useState(undefined);
  const [editWorkflowModalOpen, setEditWorkflowModalOpen] = React.useState(false)
  const [sharingOpen, setSharingOpen] = React.useState(false)
  const [realtimeMarkdown, setRealtimeMarkdown] = React.useState("")
  const [forms, setForms] = React.useState([])
  const [workflows, setWorkflows] = React.useState([])
  const [boxWidth, setBoxWidth] = React.useState(560)
  const [inputQuestions, setInputQuestions] = React.useState([])
  const [agentic, setAgentic] = React.useState(false)

  const searchParams = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search)
  const answer = searchParams.get("answer")
  const execution_id = searchParams.get("reference_execution")
  const authorization = searchParams.get("authorization")
  const sourceNode = searchParams.get("source_node") || searchParams.get("start")
  const decisionId = searchParams.get("decision_id") // ONLY for agentic workflows
  const backendUrl = searchParams.get("backend_url") || globalUrl
  const hasExecutionAuth = execution_id && authorization

  const initializedQuestionsForWorkflowId = React.useRef(null)
  useEffect(() => {
	  if (workflow === undefined || workflow === null || Object.keys(workflow).length === 0) {
		  return
	  }

	  if (workflow.input_questions === undefined || workflow.input_questions === null) {
		  return
	  }

	  // Only initialize input questions once per workflow id. Re-initializing on
	  // every workflow object change (e.g. poll updates) wipes the user's typed
	  // values and snaps the form back to the default view.
	  if (initializedQuestionsForWorkflowId.current === workflow.id) {
		  return
	  }

	  // Checks if it's a user input-node based or not 
	  if ((answer !== undefined && answer !== null) || (foundSourcenode !== undefined && foundSourcenode !== null)) { 
	  } else {
		  setInputQuestions(workflow.input_questions)
		  setUpdate(Math.random())
		  initializedQuestionsForWorkflowId.current = workflow.id
	  }
  }, [workflow])

	const IframeWrapper = (props) => {
		var propsCopy = JSON.parse(JSON.stringify(props))
		propsCopy.width = 400 
		propsCopy.height = 225 

		return <iframe {...propsCopy} style={{width: propsCopy.width, height: propsCopy.height, }} />
	}

	const ImgWrapper = (props) => {
		var propsCopy = JSON.parse(JSON.stringify(props))
		if (propsCopy.width === undefined || propsCopy.width === null) {
			propsCopy.width = 400 
			propsCopy.height = "auto"

			propsCopy.margin = "auto"
		}

		return Img(propsCopy)
	}

	const bodyDivStyle = {
		margin: "auto",
		width: isMobile? "100%" : boxWidth,
		minWidth: isMobile ? "100%" : boxWidth,
		position: "relative",
		overflow: "hidden",
		paddingBottom: 250,
	}

	// Transparent card surface — matches the rest of the dashboard (see
	// /incidents/:id) so the form blends into the page instead of floating
	// as a heavy filled panel.
	const boxStyle: React.CSSProperties = {
		color: "hsl(var(--foreground))",
		backgroundColor: "hsl(var(--card) / 0.4)",
		backgroundImage: "none",
		border: "1px solid hsl(var(--border))",
		padding: "40px 44px 36px 44px",
		borderRadius: 16,
		minHeight: 360,
		position: "relative",
		boxShadow: "0 1px 0 hsl(var(--border) / 0.4)",
		backdropFilter: "blur(6px)",
	}

    const params = useParams();
    var props = JSON.parse(JSON.stringify(defaultprops))
    props.match = {}
    // Legacy code reads `params.key` — Shuffle Security routes use `/forms/:id`,
    // so alias `id` -> `key` to keep all downstream lookups working.
    props.match.params = { ...params, key: (params as any).key ?? (params as any).id }

	const defaultTitle = workflow.name !== undefined ? "Form for " + workflow.name : "Shuffle - Form to Run Workflows"
	if (typeof document !== "undefined" && document.title != defaultTitle) {
		document.title = defaultTitle
	}

	const parsedsearch = serverside === true || typeof window === "undefined" ? "" : window.location.search
	if (serverside !== true && typeof window !== "undefined") {
		const tmpMessage = new URLSearchParams(window.location.search).get("message")
		if (tmpMessage !== undefined && tmpMessage !== null && message !== tmpMessage) {
			setMessage(tmpMessage)
		}
	}

	// Error messages etc
	const [executionInfo, setExecutionInfo] = useState("");
	const handleValidateForm = (executionArgument) => {
		// Check if every field exists
		if (executionArgument === undefined || executionArgument === null) {
			return true 
		}

		// Check if it's an object or not
		if (typeof executionArgument === "string") {
			// Make it an object
			try {
				executionArgument = JSON.parse(executionArgument)
			} catch (e) {
				//console.log("Error parsing execution argument: ", e)
				executionArgument = {}
			}
		}

		// FIXME: Error with User Input + Required arg (?)
		// Somehow validation is not happening as it should, and it just checks all 
		// questions if none are selected
		for (var key in executionArgument) {
			if (executionArgument[key] === undefined || executionArgument[key] === null || executionArgument[key] === "") {
				//console.log("Unanswered, required question: ", key)
				return false
			}
		}

		return true
	}

	const getWorkflows = () => {
		const url = `${backendUrl}/api/v1/workflows`
		shuffleFetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			credentials: "include",
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for org forms");
			}

			return response.json()
		})
		.then((responseJson) => {
			if (responseJson.success === false) {
				//toast.error("Failed getting workflows. Please try again.")
			} else {
				if (responseJson?.length > 0) {
					setWorkflows(responseJson.filter((wf) => wf?.background_processing !== true))
				}
			}
		})
		.catch((error) => {
			//toast.error("Load form error: " + error)
		})
	}

	const loadForms = (orgId) => {
		const url = `${backendUrl}/api/v1/orgs/${orgId}/forms`
		shuffleFetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			credentials: "include",
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for org forms");
			}

			return response.json()
		})
		.then((responseJson) => {
			if (responseJson.success === false) {
				//toast.error("Failed loading forms. Please try again or contact support@shuffler.io if this persists.")
			} else {
				if (responseJson?.length > 0) {
					// Sort them by name
					responseJson.sort((a, b) => a.name.localeCompare(b.name))
					setForms(responseJson)
				}
			}
		})
		.catch((error) => {
			//toast.error("Load form error: " + error)
		})
	}

	const saveWorkflow = (workflow) => {
		const url = `${backendUrl}/api/v1/workflows/${workflow.id}`
		console.log("[saveWorkflow] PUT form_control:", workflow?.form_control)
		shuffleFetch(url, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			credentials: "include",
			body: JSON.stringify(workflow),
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for workflows :O!", response.status);
				toast.error(`Failed saving workflow (HTTP ${response.status}). Form settings may not be persisted.`)
			}

			return response.json();
		})
		.then((responseJson) => {
			if (responseJson?.success === false) {
				toast.error("Failed saving workflow: " + (responseJson?.reason || "unknown"))
				return
			}
			console.log("[saveWorkflow] response:", responseJson)
			// Re-fetch from the server so we can confirm what was actually persisted
			// (the PUT response typically only returns {success:true}, not the saved object).
			getWorkflow(workflow.id, selectedNode)
		})
		.catch((error) => {
			toast.error("Save workflow error: " + error)
		});

	}

	const getApps = () => {
		shuffleFetch(backendUrl+ "/api/v1/apps", {
		  method: "GET",
		  headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		  },
		  credentials: "include",
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for apps :O!");
			}

			return response.json();
		})
		.then((responseJson) => {
			setApps(responseJson)
		})
		.catch(error => {
			console.log("App error: ", error);
		})
	}

	const ShowExecutionResults = (props) => {
		const { executionData } = props;

		if (executionData === undefined || executionData === null || (typeof executionData === 'object' && Object.keys(executionData).length === 0)) {
			return null
		}

		const executionMargin = 20 
		const defaultReturn = null
		/*
			<div style={{marginTop: executionMargin, }}>
				<Typography variant="h6" style={{color: theme.palette.primaryColor}}>
					No results yet
				</Typography>
			</div>
		*/

		if (executionData.results === undefined || executionData.results === null)  {
			return defaultReturn
		}

		const validate = validateJson(executionData.result)
		return (
			<div style={{marginTop: executionMargin, }}>
				{workflowQuestion !== "" ? null : 
					<div style={{marginTop: 20, marginBottom: 20, }}/>
				}

				{workflowQuestion !== "" ? null : 
				validate.valid === false ?
					<div style={{marginTop: 20, }}>
						{validate?.result !== undefined && validate?.result !== null && validate?.result.length > 0 ?
							<Divider />
						: null }
						<Markdown
						  components={{
							img: Img,
							code: CodeHandler,
							a: OuterLink,
						  }}
						  id="markdown_wrapper"
						  style={{
							maxWidth: "100%", 
							minWidth: "100%", 
							overflowX: "hidden",
							overflowY: "auto",
						  }}
						>
							{validate.result}
		    			</Markdown>
					</div> 
				: 
					<ReactJson
						src={validate.result}
						theme={theme.palette.jsonTheme}
						style={theme.palette.reactJsonStyle}
						collapsed={false}
						iconStyle={theme.palette.jsonIconStyle}
						collapseStringsAfterLength={theme.palette.jsonCollapseStringsAfterLength}
					    shouldCollapse={(jsonField) => {
							return collapseField(jsonField)
						}}
						displayArrayKey={false}
						enableClipboard={(copy) => {
						  //handleReactJsonClipboard(copy);
						}}
						displayDataTypes={false}
						onSelect={(select) => {
						  //HandleJsonCopy(validate.result, select, "exec");
						}}
						name={false}
					  />
				}

			</div>
		)
	}

	const onSubmit = (event, execution_id, authorization, answer) => {
		if (event !== null) {
			event.preventDefault()
		}

		stop()
  	    setMessage("")
		setExecutionData({})
		setExecutionRequest({})
		setExecutionRunning(false)
		setExecutionInfo("")

		setTimeout(() => {
  	    	setExecutionLoading(true)
		}, 250)

		var data = {
			"execution_argument": executionArgument,
			"execution_source": "form",
		}

		if (workflow.input_questions !== undefined && workflow.input_questions !== null && workflow.input_questions.length > 0) {
			try {
				data["execution_argument"] = JSON.stringify(executionArgument)
			} catch (e) {
				console.log("Error parsing execution argument: ", e)
			}
		}

		if (workflow.start !== undefined && workflow.start !== null && workflow.start.length > 0) {
			//data.start = workflow.start
	 	} else {
			/*
			if (workflow.actions !== undefined && workflow.actions !== null && workflow.actions.length > 0) {
				for (let actionkey in workflow.actions) {
        			if (workflow.actions[actionkey].isStartNode) {
						data.start = workflow.actions[actionkey].id
						break
					}
				}
			}
			*/
		}

		var url = `${backendUrl}/api/v1/workflows/${props.match.params.key}/run`
		var fetchBody = {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
			},
			mode: 'cors',
			credentials: 'include',
			crossDomain: true,
			withCredentials: true,
		}

		if (answer !== undefined && execution_id !== undefined && authorization !== undefined) {
			url += `?reference_execution=${execution_id}&authorization=${authorization}&answer=${answer}`
			data = {}
			fetchBody.method = "GET"

			if (executionArgument !== undefined && executionArgument !== null) {
				try {
					if (typeof executionArgument === "string") {
						url += "&note=" + executionArgument
					} else {
						url += "&note=" + JSON.stringify(executionArgument)
					}
				} catch (e) {
					url += "&note=" + executionArgument
				}
			}

		} else {
			fetchBody.method = "POST"
			fetchBody.body = JSON.stringify(data)
		}

		if (agentic === true) {
			if (url.includes("?")) {
				url += `&agentic=true&decision_id=${decisionId}`
			} else {
				url += `?agentic=true&decision_id=${decisionId}`
			}
		}

		// IF there is an execution argument, we should use it
		shuffleFetch(url, fetchBody)
		.then((response) => {
			if (response.status !== 200 && response.status !== 201) {

				if (answer !== undefined && execution_id !== undefined && authorization !== undefined) {
					setExecutionLoading(false)
					setExecutionRunning(true);
					setExecutionRequest({
						"execution_id": execution_id,
						"authorization": authorization,
					})

					start();
					return response.json()
				}
			}

			//if ((response.status === 401 || response.status === 403) && authorization === undefined || authorization === null || authorization?.length === 0) {
			//	toast(`This form is not available for you to run. If you this is an error, contact ${supportEmail} with a link to this form (2)`)
			//}

			return response.json()
		})
		.then(responseJson => {
			//if (responseJson.success === true) {
			//	setDisableButtons(true)
			//}

			setExecutionLoading(false)

			if (responseJson.success === false) {

				console.log("Failed sending execution request")
				if (responseJson?.reason !== undefined && responseJson?.reason !== null) {
					if (responseJson?.reason?.toLowerCase().includes("already clicked")) {
						setMessage("This form has been answered. You may close this window.")
					} else {
						toast.warn(responseJson?.reason)
					}
				}

				stop()
				//setMessage("")
				setExecutionData({})
				setExecutionInfo("")
				setExecutionRunning(false)
				setExecutionRequest({})
			} else {
				console.log("Started execution")

				start()
				setExecutionRunning(true);
				if (answer !== undefined && answer !== null) {
					console.log("Skipping start")
				} else {
					setExecutionRunning(true);
					setExecutionRequest(responseJson)
					start()
				}

				// If execution_id or authorization, add them to the URL.
				// Use { replace: true } so the in-progress run does not push
				// a new history entry (which feels like a page reload).
				if (responseJson?.execution_id !== undefined && responseJson?.execution_id !== null && responseJson?.execution_id?.length > 0 && responseJson?.authorization !== undefined && responseJson?.authorization !== null && responseJson?.authorization?.length > 0) {
					navigate(`?execution_id=${responseJson.execution_id}&authorization=${responseJson.authorization}`, { replace: true })
				} else if (responseJson?.execution_id !== undefined && responseJson?.execution_id !== null && responseJson?.execution_id?.length > 0) {
					navigate(`?execution_id=${responseJson.execution_id}`, { replace: true })
				}
			}
		})
		.catch(error => {
			//setExecutionInfo("Error in workflow startup: " + error)
			console.log("Error starting workflow: ", error)
			toast.warn(`Error submitting form. Please try again: ${error}`)

			stop()
			setMessage("")
			setExecutionData({})
			setExecutionInfo("")

			setExecutionLoading(false)
		})
	}

    const { start, stop } = useInterval({
      duration: 1500,
      startImmediate: true,
      callback: () => {
        fetchUpdates(executionRequest.execution_id, executionRequest.authorization)
      },
    })

	const handleExecutionLoader = () => {
	  if (window === undefined || window === null) {
		  console.log("No window")
		  return
	  }

	  const urlParams = new URLSearchParams(window.location.search)
	  if (urlParams === undefined || urlParams === null) {
		  console.log("No search params")
		  return
	  }

	  const execution = urlParams.get("execution_id")
	  if (execution === undefined || execution === null || execution.length === 0) {
		  console.log("No execution")
	  }

	  // Only works if you're logged in
      fetchUpdates(execution, "")
	}

	const loadInputWorkflowData = (workflow_id, inputWorkflow) => {

		const url = `${backendUrl}/api/v1/workflows/${workflow_id}/run`
		shuffleFetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			credentials: "include",
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for workflows :O!");
			}

			return response.json()
		})
		.then((responseJson) => {
			// Timeout after 5 seconds (max load time)
			if (responseJson.execution_id !== undefined && responseJson.execution_id !== null && responseJson.execution_id.length > 0 && responseJson.authorization !== undefined && responseJson.authorization !== null && responseJson.authorization.length > 0) {
	
				//for (var key in responseJson.results) {
				for (let i = 0; i < 5; i++) {
					setTimeout(() => {
						fetchUpdates(responseJson.execution_id, responseJson.authorization, false, true)
					}, i * 1000)
				}
			} else {
				// Replace the markdown with the result
				if (realtimeMarkdown !== undefined && realtimeMarkdown !== null && realtimeMarkdown.length > 0) {
					const newmarkdown = realtimeMarkdown.replace(`{{ ${workflow_id} }}`, "", -1)
					setRealtimeMarkdown(newmarkdown)
				} else if (inputWorkflow?.form_control?.input_markdown !== undefined && inputWorkflow?.form_control?.input_markdown !== null && inputWorkflow?.form_control?.input_markdown.length > 0) {
					const newmarkdown = inputWorkflow?.form_control?.input_markdown.replace(`{{ ${workflow_id} }}`, "", -1)
					setRealtimeMarkdown(newmarkdown)
				}
			}

		})
		.catch((error) => {
			console.log("Get workflow error: ", error.toString())

			if (realtimeMarkdown !== undefined && realtimeMarkdown !== null && realtimeMarkdown.length > 0) {
				const newmarkdown = inputWorkflow?.form_control?.input_markdown.replace(`{{ ${workflow_id} }}`, "", -1)
				setRealtimeMarkdown(newmarkdown)
			} else if (inputWorkflow?.form_control?.input_markdown !== undefined && inputWorkflow?.form_control?.input_markdown !== null && inputWorkflow?.form_control?.input_markdown.length > 0) {
				const newmarkdown = inputWorkflow?.form_control?.input_markdown.replace(`{{ ${workflow_id} }}`, "", -1)
				setRealtimeMarkdown(newmarkdown)
			}
		})
	}

	const setupSourcenode = (workflow, selectedNode) => { 

		if (workflow.input_questions !== undefined && workflow.input_questions !== null && workflow.input_questions.length > 0) {

			var newexec = {}
			for (let questionkey in workflow.input_questions) {
				const question = workflow.input_questions[questionkey]

				var multiChoiceOptions = question.value !== undefined && question.value !== null && question.value.length > 0 && question.value.includes(";") ? question.value.split(";") : []
				if (multiChoiceOptions.length > 1) {
					newexec[multiChoiceOptions[0]] = ""
				} else {
					newexec[question.value] = ""
				}
			}

			// Override with just relevant fields
			if (sourceNode !== undefined && sourceNode !== null && sourceNode.length > 0) {
				for (var triggerkey in workflow.triggers) {
					const trig = workflow.triggers[triggerkey]
					if (trig.id !== sourceNode) {
						continue
					}

					console.log("TRIG: ", trig)
					if (trig.parameters === undefined || trig.parameters === null) {
						trig.parameters = []
					}

					newexec = {}
					for (var paramkey in trig.parameters) {
						const param = trig.parameters[paramkey]
						if (param.name !== "input_questions") {
							continue
						}

						// Parse as json
						var keepfields = []
						try {
							const parsed = JSON.parse(param.value)

							// Find this in the workflow.input_questions
							for (var questionkey in workflow.input_questions) {
								var question = JSON.parse(JSON.stringify(workflow.input_questions[questionkey]))
								question.value = question.value.split(";")[0]
								if (parsed.includes(question.name)) {
									keepfields.push(question.value)
								}
							}
						
							//newexec = {}
						} catch (e) {
							console.log("Error parsing input questions: ", e)
						}

						// Remapping it to exec
						if (keepfields.length > 0) {
							newexec = {}
							for (var key in keepfields) {
								newexec[keepfields[key]] = ""
							}
						}
					}

				}
			}

			console.log("Setting exec arg: ", newexec)
			setExecutionArgument(newexec)
		}

		if (selectedNode !== undefined && selectedNode !== null && selectedNode.length > 0) {

			var found = false
			for (var actionkey in workflow.actions) {
				if (workflow.actions[actionkey].id === selectedNode) {
					found = true
					setFoundSourcenode(workflow.actions[actionkey])
					break
				}
			}

			if (!found) {
				for (var triggerkey in workflow.triggers) {
					if (workflow.triggers[triggerkey].id !== selectedNode) {
						continue
					}
		

					setFoundSourcenode(workflow.triggers[triggerkey])

					if (workflow.input_questions !== undefined && workflow.input_questions !== null && workflow.input_questions.length > 0 && workflow.triggers[triggerkey].trigger_type === "USERINPUT") {

						// Look for input questions param
						for (var paramkey in workflow.triggers[triggerkey].parameters) {
							if (workflow.triggers[triggerkey].parameters[paramkey].name === "input_questions") {

								var relevantquestions = []
								for (var questionkey in workflow.input_questions) {
									if (workflow.triggers[triggerkey].parameters[paramkey].value.includes(workflow.input_questions[questionkey].name)) {
										relevantquestions.push(workflow.input_questions[questionkey])
									}
								}

								setInputQuestions(relevantquestions)
								//workflow.input_questions = relevantquestions
							}
						}
					}


					break
				}
			}
		} else {
			setInputQuestions(workflow.input_questions)
		}

		if (workflow?.form_control?.input_markdown !== undefined && workflow?.form_control?.input_markdown !== null && workflow?.form_control?.input_markdown.length > 0) {
			// Look for {{ uuid }} format, and try to run that workflow with their account
			// This is a hack, but a fun one.
			var newmarkdown = workflow?.form_control?.input_markdown.replace("", "")
			
			const uuidRegex = /{{\s[a-f0-9-]+\s}}/g
			const found = newmarkdown.match(uuidRegex)
			if (found !== undefined && found !== null && found.length > 0) {
				var handled = []
				for (var foundkey in found) {
					const uuid = found[foundkey].replace("{{", "").replace("}}", "").trim()

					if (handled.includes(uuid)) {
						continue
					}

					handled.push(uuid)

					const storageKey = `workflowresult_${uuid}`
					const value = localStorage.getItem(storageKey)

					var runWorkflow = false
					if (value !== undefined && value !== null && value.length > 0) {
						// Check if timestamp with new Date().getTime() is more than 10 minutes ago
						const parsedValue = JSON.parse(value)
						if (parsedValue.timestamp !== undefined && parsedValue.timestamp !== null) {
							// 1 min = 60000ms -> 5 min = 300000ms
							const now = new Date().getTime()
							if (now - parsedValue.timestamp > 300000) {
								localStorage.removeItem(storageKey)
								runWorkflow = true 
							} else {
								newmarkdown = newmarkdown.replace(`{{ ${uuid} }}`, parsedValue.result, -1)
							}
						} else {
							runWorkflow = true
						}
					} else {
						runWorkflow = true
					}

					if (runWorkflow) {
						loadInputWorkflowData(uuid, workflow)
					}

				}

				setRealtimeMarkdown(newmarkdown)
			}
		}

		if (workflow.status === "EXECUTING" || workflow.status === "SUCCESS" || workflow.status === "ABORTED" || workflow.status === "STOPPED" || workflow.status === "FAILURE" || workflow.status === "FINISHED") {
			setMessage("Already handled. You may close this window.")
		}
	}

	const getWorkflow = (workflow_id, selectedNode) => {
  		setRealtimeMarkdown("")

		const url = `${backendUrl}/api/v1/workflows/${workflow_id}`
		shuffleFetch(url, {
		  method: "GET",
		  headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		  },
		  credentials: "include",
		})
      .then((response) => {
        if (response.status !== 200) {
          console.log("Status not 200 for workflows :O!");
        }

		//if (response.status >= 400 && authorization === undefined || authorization === null || authorization.length === 0) {
		//	toast.warn(`This form may not be available to you. If you think this is an error, please contact ${supportEmail} with the URL.`)
		//}

        return response.json()
      })
      .then((responseJson) => {
		if (responseJson.success === false) {
			if (workflow_id !== execution_id && !hasExecutionAuth) { 
				toast.warn("Form not found. Redirecting to forms list.")
				navigate("/forms")
			}
			return
		}

        // Not sure why this is necessary.
        if (responseJson.isValid === undefined) {
          responseJson.isValid = true;
        }

        if (responseJson.errors === undefined) {
          responseJson.errors = [];
        }

        if (responseJson.actions === undefined || responseJson.actions === null) {
          responseJson.actions = [];
        }

        if (responseJson.triggers === undefined || responseJson.triggers === null) {
          responseJson.triggers = [];
        }

		setupSourcenode(responseJson, selectedNode)

		handleExecutionLoader()

		handleGetOrg(responseJson.org_id)

		if (responseJson.form_control === undefined || responseJson.form_control === null) {
			responseJson.form_control = {
				"input_markdown": "",
				"output_yields": [],
				"form_width": 500,
			}
		}


		if (responseJson.form_control.form_width !== undefined && responseJson.form_control.form_width !== null && responseJson.form_control.form_width > 300) {
			setBoxWidth(responseJson.form_control.form_width)
		}

		setWorkflow(responseJson)
      })
      .catch((error) => {
        console.log("Get workflow error: ", error.toString());
      });
  };


  const handleUpdateResults = (responseJson, executionRequest) => {
		if (responseJson === undefined || responseJson === null || responseJson.success === false) {
			return
		}

		//console.log("Got response: ", responseJson)

		(function(fn){fn()})(() => {
		  // Use a functional setState so we always compare against the latest
		  // executionData (closure-captured executionData goes stale across
		  // re-submits and causes new poll responses to be dropped, leaving
		  // the form looking like nothing happened).
		  setExecutionData((prev) => {
			if (JSON.stringify(responseJson) === JSON.stringify(prev)) {
				return prev
			}

			// Accept the response if we have no previous data, or if it
			// belongs to the currently-polled execution (either prev's id
			// or the incoming request's id).
			const matchesPrev = prev && prev.execution_id && responseJson.execution_id === prev.execution_id
			const matchesRequest = executionRequest && executionRequest.execution_id && responseJson.execution_id === executionRequest.execution_id
			const prevEmpty = !prev || prev.execution_id === undefined
			if (!prevEmpty && !matchesPrev && !matchesRequest) {
				return prev
			}

			if (responseJson.result !== undefined && responseJson.result !== null && responseJson.result.length > 0) {
				if (responseJson.result.startsWith("[") && responseJson.result.endsWith("]")) {
					try {
						responseJson.result = JSON.parse(responseJson.result).length
					} catch (e) {
						console.log("Error parsing length: ", e)
					}
				}
			}

			for (var key in responseJson.results) {
				if (responseJson.results[key].status !== "WAITING") {
					continue
				}

				const validate = validateJson(responseJson.results[key].result)
				if (validate.valid && typeof validate.result === "string") {
					validate.result = JSON.parse(validate.result)
				}

				console.log("Found waiting!: ", validate.result)

				if (validate?.result?.information !== undefined && validate?.result?.information !== null) {
					console.log("Success! Not checking again.")
					setWorkflowQuestion(typeof validate?.result?.information === "string" ? validate.result.information : "")
				} else {
					console.log("No information found for questions?: ", validate.result)
					if (typeof validate.result === "string" || Object.keys(validate.result).length === 2) {
						setTimeout(() => {
							fetchUpdates(responseJson.execution_id, responseJson.authorization)
						}, 2000)
					} else {
						console.log("NOT re-fetching")
					}
				}

				break
			}

			return responseJson
		  })

      if (responseJson.status === "ABORTED" || responseJson.status === "STOPPED" || responseJson.status === "FAILURE" || responseJson.status === "WAITING") {
        stop();

        if (executionRunning) {
          setExecutionRunning(false);
        }

        //getWorkflowExecution(props.match.params.key, "");
      } else if (responseJson.status === "FINISHED") {
        setExecutionRunning(false)
        stop();
        //getWorkflowExecution(props.match.params.key, "");
      }
		})
	}

  const handleGetOrg = (orgId, execution_id, authorization) => {
    if (orgId === undefined || orgId === null || orgId.length === 0) {
      return
    }

    // Just use this one?
    var url = execution_id !== undefined && authorization !== undefined ?  `${backendUrl}/api/v1/orgs/${orgId}?reference_execution=${execution_id}&authorization=${authorization}` : `${backendUrl}/api/v1/orgs/${orgId}`;

	getWorkflows() 
	loadForms(orgId)

    shuffleFetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.status === 401) {
        }

        return response.json();
      })
      .then((responseJson) => {
        if (responseJson["success"] === false) {
        } else {
          if (responseJson.sync_features === undefined || responseJson.sync_features === null) {
          }

		  if (document != undefined && document.title != defaultTitle) {
		  	document.title = responseJson.name + " - " + defaultTitle
		  }

		  if (responseJson.image !== undefined && responseJson.image !== null && responseJson.image.length > 0) {
		  } else {
			  responseJson.image = theme.palette.defaultImage
		  }
          setSelectedOrganization(responseJson)
        }
      })
      .catch((error) => {
        console.log("Error getting org: ", error);
      });
  };

	const fetchUpdates = (execution_id, authorization, getorg, replaceMarkdown) => {
		if (execution_id === undefined || execution_id === null || execution_id === "") {
			stop()
			return
		}

		const innerRequest = {
			"execution_id": execution_id,
			"authorization": authorization === undefined || authorization === null ? "" : authorization,
		}

		if (executionRequest.execution_id !== innerRequest.execution_id && replaceMarkdown !== true) {
			setExecutionRequest(innerRequest)
		}

		if (execution_id === "") {
			console.log("No execution id or authorization")
  			setExecutionLoading(false)
			setExecutionRunning(false)
			stop()
			return
		}

		shuffleFetch(backendUrl + "/api/v1/streams/results", {
		  method: "POST",
		  headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		  },
		  body: JSON.stringify(innerRequest),
		  credentials: "include",
		})
		.then((response) => {
			if (response.status !== 200) {
				console.log("Status not 200 for stream results :O!");

				//toast.warn("Error getting results.. Please try again or contact support@shuffler.io if this persists.")
			}
		
			return response.json();
		})
		.then((responseJson) => {
			if (responseJson?.success == false) {
				toast.error(responseJson?.reason || "This form link is no longer valid.")
				setExecutionLoading(false)
				setExecutionRunning(false)
				setDisableButtons(true)
				stop()
				navigate("/forms")
				return
			}

			if (execution_id !== undefined && execution_id !== null && authorization !== undefined && authorization !== null && execution_id.length > 0 && authorization.length > 0 && disableButtons === false && responseJson?.status !== "" && responseJson?.status !== "WAITING") {
				console.log("IN here 1")
				setDisableButtons(true)
			}

			if (execution_id !== undefined && execution_id !== null && authorization !== undefined && authorization !== null && execution_id.length > 0 && authorization.length > 0 && responseJson.workflow !== undefined && responseJson.workflow !== null) {
				console.log("IN here 2")
				// Only hydrate the workflow on the first poll. Re-setting it on
				// every tick wipes the user's typed input field values and makes
				// the form snap back to its "default" state after submitting.
				setWorkflow((prev) => {
					if (prev && prev.id && prev.id === responseJson.workflow.id) {
						return prev
					}
					setupSourcenode(responseJson.workflow, sourceNode)
					return responseJson.workflow
				})

				//const decisionId = searchParams.get("decision_id") // ONLY for agentic workflows
				// Check for decision_id in url
				if (decisionId?.length > 0 && responseJson?.workflow?.actions?.length > 0 && sourceNode?.length > 0 && responseJson?.results?.length > 0) {
					console.log("AGENTIC: Setting workflow: ", responseJson.workflow, ", EXEC RESULTS: ", responseJson.results)

  					setAgentic(true)

					for (var resultkey in responseJson.results) {
						const result = responseJson.results[resultkey]
						if (result.action.id !== sourceNode) {
							continue
						}

						const validated = validateJson(result.result)
						if (!validated.valid) {
							console.log("Error parsing result: ", validated.error)
							continue
						}

						var parsedresult = validated.result
						console.log("PARSED RES: ", parsedresult)
						if (parsedresult?.decisions?.length > 0) {
							var newexec = executionArgument
							if (newexec === undefined || newexec === null || Object.keys(newexec).length === 0) {
								newexec = {}
							}

							for (var decisionkey in parsedresult?.decisions) {
								const decision = parsedresult.decisions[decisionkey]
								if (decision?.run_details?.id !== decisionId) {
									continue
								}

								for (var fieldkey in decision?.fields) {
									const field = decision.fields[fieldkey]
									if (field.key === "question" && !inputQuestions.find(q => q.name=== field.value)) {
										console.log("QUESTION: ", field)
										const newquestion = {
											"name": field.value,
											"value": field.key+"_"+fieldkey,
										}

										inputQuestions.push(newquestion)

										newexec[newquestion.value] = ""
									}
								}
							}

							setInputQuestions([...inputQuestions] )
							console.log("EXEC: ", newexec)
							setExecutionArgument(newexec)

							responseJson.workflow.input_questions = inputQuestions
							setWorkflow(responseJson?.workflow)
							setDisableButtons(false)
						}
					}
				}
			}


			if (replaceMarkdown === true) {
				if (responseJson.result.length > 0) {
					// Set local storage for the workflow id
					const storageKey = `workflowresult_${responseJson.workflow.id}`
					const value = {
						"timestamp": new Date().getTime(),
						"result": responseJson.result,
					}

					localStorage.setItem(storageKey, JSON.stringify(value))
				}

				if (realtimeMarkdown !== undefined && realtimeMarkdown !== null && realtimeMarkdown?.length > 0) {
					const newmarkdown = realtimeMarkdown.replace(`{{ ${responseJson.workflow.id} }}`, responseJson.result, -1)
					setRealtimeMarkdown(newmarkdown)

				} else if (workflow?.form_control?.input_markdown !== undefined && workflow?.form_control?.input_markdown !== null && workflow?.form_control?.input_markdown.length > 0) {
					const newmarkdown = workflow?.form_control?.input_markdown.replace(`{{ ${responseJson.workflow.id} }}`, responseJson.result, -1)
					setRealtimeMarkdown(newmarkdown)
				}

			} else {
				if (getorg === true) {
					handleGetOrg(responseJson.org_id, execution_id, authorization)
				}

				handleUpdateResults(responseJson, executionRequest);
			}
		})
		.catch((error) => {
			console.log("Execution result Error: ", error);
		});
  };


	useEffect(() => {
		if (!isLoaded) {
			return
		}

		if (props.match.params.key === undefined) {
  			setExplorerUi(true)
			// Reset any per-workflow state left over from /forms/:id so the
			// list view does not get stuck on a stale loader after a redirect.
			setWorkflow({})
			setMessage("")
			setRealtimeMarkdown("")

			if (isLoggedIn && userdata?.active_org?.id) {
				loadForms(userdata?.active_org?.id)
				handleGetOrg(userdata?.active_org?.id)
			}

			return
		}

		setExplorerUi(false)
		getWorkflow(props.match.params.key, sourceNode) 
		if (execution_id !== undefined && execution_id !== null && authorization !== undefined && authorization !== null) {
			fetchUpdates(execution_id, authorization, true)
		}

		if (answer !== undefined && answer !== null) {
			console.log("Got answer: ", answer)
		}
	}, [isLoaded, props.match.params.key])

	useEffect(() => {
		if (executionData === undefined || executionData === null || (typeof executionData === 'object' && Object.keys(executionData).length === 0)) {
			return
		}

		if (foundSourcenode === undefined || foundSourcenode === null || (typeof foundSourcenode === 'object' && Object.keys(foundSourcenode).length === 0)) {
			return
		}

		if (foundSourcenode.trigger_type !== "USERINPUT") {
			return
		}

		if (executionData.results === undefined || executionData.results === null || executionData.results.length === 0) {
			return
		}

		for (var resultkey in executionData.results) {
			const result = executionData.results[resultkey]
			if (result.action.id !== foundSourcenode.id) {
				continue
			}

			var parsedresult = result.result
			try {
				parsedresult = JSON.parse(parsedresult)
			} catch (e) {
				console.log("Error parsing result: ", e)
			}

			if (result.status !== "WAITING") {
				if (parsedresult.information !== undefined && parsedresult.information !== null && parsedresult.information.length > 0) {
					setWorkflowQuestion(typeof parsedresult.information === "string" ? parsedresult.information : "")
				}

				if (parsedresult.click_info !== undefined && parsedresult.click_info !== null) {
					if (parsedresult.click_info.user !== undefined && parsedresult.click_info.user !== null && parsedresult.click_info.user.length > 0) {
						setMessage("Answered by " + parsedresult.click_info.user)
  
					}
				} else {
					setMessage("Answered.")
				}

			}

			break
		}

	}, [executionData, foundSourcenode])

	const buttonBackground = "linear-gradient(to right, #f86a3e, #f34079)"
	const buttonStyle = {borderRadius: 25, height: 50, fontSize: 18, backgroundImage: handleValidateForm(executionArgument) || executionLoading ? buttonBackground : "grey", color: "white"}
	
	// Check if all fields are filled in?
	var disabledButtons = executionLoading || executionRunning || message.length > 0  || disableButtons
	if (disabledButtons === false && workflow.input_questions !== undefined && workflow.input_questions !== null && workflow.input_questions.length > 0) {
		// Check field values
		//disabledButtons = handleValidateForm(executionArgument)
	}

	const organization = selectedOrganization !== undefined && selectedOrganization !== null ? selectedOrganization.name : ""
	const contact = selectedOrganization !== undefined && selectedOrganization !== null && selectedOrganization.org !== undefined && selectedOrganization.org !== null? selectedOrganization.org : "support@shuffler.io"
	//const contact = selectedOrganization !== undefined && selectedOrganization !== null && selectedOrganization.contact !== undefined && selectedOrganization.contact !== null? selectedOrganization.contact : "support@shuffler.io"
	
	const image = selectedOrganization !== undefined && selectedOrganization !== null && selectedOrganization.image !== undefined && selectedOrganization.image !== null && selectedOrganization.image !== "" ? selectedOrganization.image : theme.palette.defaultImage

	//console.log("IMG: ", image, "ORG: ", selectedOrganization)

	useEffect(() => {
		if (disabledButtons || answer === undefined || answer === null || organization === "Unknown" || buttonClicked.length > 0) {
			return
		}

		// Show rejection form for answer=false instead of auto-clicking
		if (answer === "false") {
			return
		}

		var buttonid = ""
		if (answer === "true") {
			buttonid = "continue_execution"
		}

		if (buttonid !== "") {
			const foundButton = document.getElementById(buttonid)
			if (foundButton !== undefined && foundButton !== null) {
				foundButton.click()
			}
		}
	}, [disabledButtons, answer, organization, buttonClicked])

	const FormList = () => {
		return (
			<div>
				{forms.map((form, formIndex) => {
					if (form.id === undefined || form.id === null) {
						return null
					}

					return (
						<RecentWorkflow
							key={formIndex}
							workflow={form}
							onclickHandler={() => {
								navigate(`/forms/${form.id}`)
								getWorkflow(form.id, sourceNode)
								setExplorerUi(false)
							}}
							currentWorkflowId={workflow.id}
						/>
					)
				})}
			</div>
		)
	}
	
	const ExplorerUi = () => {
		return (
			<div style={{paddingTop: 24, width: "100%", maxWidth: 480, margin: "0 auto", textAlign: "center"}}>

				{!isLoggedIn && !hasExecutionAuth ?
					<div style={{paddingTop: 32, paddingBottom: 32}}>
						<div style={{
							width: 56, height: 56, borderRadius: 14,
							backgroundColor: "hsl(var(--primary) / 0.1)",
							border: "1px solid hsl(var(--primary) / 0.2)",
							display: "flex", alignItems: "center", justifyContent: "center",
							margin: "0 auto 20px",
						}}>
							<LockIcon size={26} style={{color: "hsl(var(--primary))"}} />
						</div>
						<Typography variant="h6" style={{marginBottom: 8, fontWeight: 600, color: "hsl(var(--foreground))"}}>
							Log in to view your forms
						</Typography>
						<Typography variant="body2" style={{marginBottom: 24, color: "hsl(var(--muted-foreground))", lineHeight: 1.6}}>
							You need to be logged in to see the forms available in your organization.
						</Typography>
						<Button
							variant="contained"
							onClick={() => {
								const next = encodeURIComponent(window.location.pathname + window.location.search)
								navigate(`/login?view=${next}`)
							}}
							style={{
								textTransform: "none",
								height: 36,
								backgroundColor: "hsl(var(--primary))",
								color: "hsl(var(--primary-foreground))",
								boxShadow: "none",
								borderRadius: 8,
								paddingLeft: 20,
								paddingRight: 20,
								fontWeight: 600,
							}}
						>
							Log in
						</Button>
					</div>
					: (forms === undefined || forms === null || forms.length === 0) ?
					<div style={{paddingTop: 32, paddingBottom: 32}}>
						<Typography variant="h6" style={{marginBottom: 8, fontWeight: 600, color: "hsl(var(--foreground))"}}>
							No forms found
						</Typography>
						<Typography variant="body2" style={{color: "hsl(var(--muted-foreground))", lineHeight: 1.6}}>
							All workflows are forms, and can be accessed by going to /forms/{`{workflow_id}`}. You can control the form by editing the workflow details in the Forms section.
						</Typography>	
					</div>
					: null
				}

				{forms === undefined || forms === null || forms.length === 0 ? null :
					<Autocomplete
						disabled={forms === undefined || forms === null || forms.length === 0}
						id="form-workflow-search"
						autoHighlight
						value={null}
						ListboxProps={{
						  style: {
							backgroundColor: theme.palette.inputColor,
							color: "white",
						  },
						}}
						sx={{
						  '& .MuiOutlinedInput-root': {
							height: 40,
						  },
						  '& .MuiAutocomplete-input': {
							padding: '8px',
						  },
						}}
						getOptionSelected={(option, value) => option.id === value.id}
						getOptionLabel={(option) => {
						  if (
							option === undefined ||
							option === null ||
							option.name === undefined ||
							option.name === null
						  ) {
							return "";
						  }

						  const newname = (
							option.name.charAt(0).toUpperCase() + option.name.substring(1)
						  ).replaceAll("_", " ");
						  return newname;
						}}
						options={forms}
						fullWidth
						style={{
						  backgroundColor: theme.palette.inputColor,
						  borderRadius: theme.palette?.borderRadius,
						  marginTop: 0,
						}}
						renderOption={(props, data, state) => {
						  if (data.id === workflow.id) {
							data = workflow;
						  }

						  const formDescription = data?.form_control?.form_description || data?.description || ""
						  const isPrivate = data?.sharing !== "form"

						  return (
							<MenuItem
								{...props}
								key={data.id}
								style={{
								  backgroundColor: theme.palette.inputColor,
								  display: 'flex',
								  alignItems: 'flex-start',
								  gap: 10,
								  padding: '10px 12px',
								}}
								onClick={() => {
									navigate(`/forms/${data.id}`)
									getWorkflow(data.id, sourceNode)
									setExplorerUi(false)
								}}
								value={data}
							>
							  <DescriptionIcon style={{ marginTop: 2, color: 'hsl(var(--muted-foreground))' }} />
							  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
								<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
								  <Typography variant="body2" style={{ fontWeight: 600, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
									{data.name}
								  </Typography>
								  {isPrivate ? (
									<LockIcon size={12} style={{ color: 'hsl(var(--muted-foreground))' }} />
								  ) : null}
								</div>
								{formDescription ? (
								  <Typography variant="caption" style={{ color: 'hsl(var(--muted-foreground))', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
									{formDescription}
								  </Typography>
								) : (
								  <Typography variant="caption" style={{ color: 'hsl(var(--muted-foreground))' }}>
									Form
								  </Typography>
								)}
							  </div>
							</MenuItem>
						  )
						}}
						renderInput={(params) => {
						  return (
							<div style={{ display: "flex", }}>
							  <TextField
								style={theme.palette.textFieldStyle}
								{...params}
								label="Available forms"
								placeholder="Search forms"
								variant="outlined"
							  />
							</div>
						  )
						}}
					/>
				}
			</div> 
		)
	}

	var validResults = 0
	const basedata = 
		<div style={bodyDivStyle}>
			<Paper style={boxStyle}>
				<div style={{position: "absolute", top: 20, right: 10,}}>
					{executionData?.status === "" ? null :
					executionData?.status === "FINISHED" ? 
						<Tooltip title="The previous Workflow Finished" placement="top">
							<CheckCircleIcon style={{color: green, marginRight: 10, }} />
						</Tooltip>
					: executionData?.status === "EXECUTING" ? 
						<Tooltip title="The Workflow is current running" placement="top">
							<DirectionsRunIcon style={{color: theme.palette.secondary, marginRight: 10, }} />
						</Tooltip>
					: executionData?.status === "ABORTED" || executionData?.status === "FAILURE" ? 
						<Tooltip title={`The workflow run failed with status ${executionData?.status}`} placement="top">
							<ErrorIcon style={{color: red, marginRight: 10, }} />
						</Tooltip>
					: executionData?.status === "WAITING" ?
						<Tooltip title={`The workflow is waiting for user input`} placement="top"> 
							<PauseIcon style={{color: yellow, marginRight: 10, }} />
						</Tooltip>
					: null}
				</div>

				{explorerUi === true ? 
					<ExplorerUi />
					:
					workflow.id === undefined || workflow.id === null ?
					<div style={{paddingTop: 150, marginTop: 150, width: 250, itemAlign: "center", textAlign: "center", margin: "auto", }}>
						<CircularProgress />
						<Typography variant="body1" style={{marginTop: 20, }}>
							Loading Details...
						</Typography>
					</div>
				: 
				<div>
					{(() => {
						// react-markdown v9 throws "Expected usable value, not `undefined`"
						// if children is undefined/null. workflowQuestion can be set to
						// `undefined` by API parsing paths, so coerce defensively.
						const md =
							(typeof workflowQuestion === "string" && workflowQuestion.length > 0)
								? workflowQuestion
								: (typeof realtimeMarkdown === "string" && realtimeMarkdown.length > 0)
									? realtimeMarkdown
									: (typeof workflow?.form_control?.input_markdown === "string" && workflow.form_control.input_markdown.length > 0)
										? workflow.form_control.input_markdown
										: ""
						return md.length > 0 ? (
							<div className="prose dark:prose-invert max-w-none" style={{marginBottom: 20, overflowWrap: "break-word", wordBreak: "break-word", }}>
								<Markdown
								  components={{
									iframe: IframeWrapper,
									img: ImgWrapper,
									code: CodeHandler,
									a: OuterLink,
								  }}
								  id="markdown_wrapper"
								  style={{
									maxWidth: "100%", minWidth: "100%",
								  }}
								  rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema], ...(rehypeRaw ? [rehypeRaw] : [])]}
								>
								  {md}
			    				</Markdown>
							</div>
						) : null
					})()}

      				<form onSubmit={(e) => {onSubmit(e)}} style={{margin: "25px 0px 15px 0px",}}>
						{(typeof workflowQuestion === "string" && workflowQuestion.length > 0) || (typeof workflow?.form_control?.input_markdown === "string" && workflow.form_control.input_markdown.length > 0) ? null : 
						<div>
							{/*
							<img
								alt={workflow.name}
								src={image}
								style={{
									marginRight: 20,
									width: 100,
									height: 100,
									border: `2px solid ${green}`,
									borderRadius: 50,
									position: "absolute",
									top: -50,
									left: 200,
								}}
							/>
							*/}

							{organization?.length > 0 &&
								<Typography
									style={{
										marginTop: 0,
										marginBottom: 10,
										textAlign: "center",
										fontSize: 11,
										letterSpacing: "0.14em",
										textTransform: "uppercase",
										fontWeight: 600,
										color: "hsl(var(--muted-foreground))",
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{organization}
								</Typography>
							}

							{answer !== undefined && answer !== null ? null :
								<>
									<Typography
										style={{
											marginTop: 0,
											marginBottom: 8,
											textAlign: "center",
											fontSize: 28,
											fontWeight: 700,
											lineHeight: 1.2,
											letterSpacing: "-0.01em",
											color: "hsl(var(--foreground))",
										}}
									>
										{workflow.name}
									</Typography>
									<Typography
										style={{
											textAlign: "center",
											marginBottom: 28,
											fontSize: 14,
											color: "hsl(var(--muted-foreground))",
											lineHeight: 1.5,
										}}
									>
										{workflow?.description?.length > 0
											? workflow.description
											: "Provide the details below to trigger this workflow."}
									</Typography>
								</>
							}

							{disabledButtons && message.length > 0 ? null :
								message?.length > 0 &&
								<Typography style={{textAlign: "center", marginTop: 4, marginBottom: 16, fontSize: 14, color: "hsl(var(--muted-foreground))"}}>
									{message}
								</Typography>
							}

							{workflowQuestion.length > 0 ?
								<div style={{
									backgroundColor: theme.palette.inputColor,
									padding: 20,
									borderRadius: theme.palette?.borderRadius,
									marginBottom: 35, 
									marginTop: 30, 
								}}>
									<Typography variant="body1"  style={{ marginRight: 15, textAlign: "center", whiteSpace: "pre-line", }}>
										{workflowQuestion}
									</Typography>
								</div>
							: null}

							</div>
						}
							
						{workflow?.input_questions !== undefined && workflow?.input_questions !== null && workflow?.input_questions?.length > 0 ?
							<div style={{marginBottom: 5, }}>
								{inputQuestions?.map((question, index) => {

									// Multiple choice checks for semicolon-splits
									var multiChoiceOptions = question.value !== undefined && question.value !== null && question.value.length > 0 && question.value.includes(";") ? question.value.split(";") : []
									// Remove empty keys from array
									multiChoiceOptions = multiChoiceOptions.filter(function(e) { return e !== "" })
									if (multiChoiceOptions.length > 1 && (executionArgument[multiChoiceOptions[0]] === undefined || executionArgument[multiChoiceOptions[0]] === null || executionArgument[multiChoiceOptions[0]] === "")) {
										// Set the first item to be default
										executionArgument[multiChoiceOptions[0]] = multiChoiceOptions[1]
									}

									const parsedLabel = question?.value?.startsWith("question_") ? 
										"" 
										: 
										question?.value?.charAt(0)?.toUpperCase() + question?.value?.slice(1)

									return (
										<div style={{marginBottom: 10}} key={index}>

											<Typography variant="body2" color="textSecondary">
												{question.name}
											</Typography>

											{multiChoiceOptions.length > 1 ?
												<div>
													<Select
														disabled={disabledButtons}
														fullWidth
														required
														label={multiChoiceOptions[0]}
														value={executionArgument[multiChoiceOptions[0]]}
														onChange={(e) => {
															const curQuestion = multiChoiceOptions[0]
															executionArgument[curQuestion] = e.target.value
															setUpdate(Math.random())
														}}
													>

														{multiChoiceOptions.map((option, menuIndex) => {
															if (menuIndex === 0) {
																return null
															}

															return (
																<MenuItem 
																	key={menuIndex}
																	value={option}
																>
																	{option}
																</MenuItem>
															)
														})}
													</Select>
												</div>
												:
												<TextField
													color="primary"
													style={{
														backgroundColor: theme.palette.inputColor, 
														marginTop: 5, 
													}}
													label={parsedLabel}
													required

													fullWidth={true}
													placeholder=""
													id="emailfield"
													margin="normal"
													variant="outlined"
													onChange={(e) => {
														executionArgument[question.value] = e.target.value
														setExecutionArgument(executionArgument)
														setUpdate(Math.random())
													}}
												/>
											}
										</div>
									)
								})}
							</div>
						: 
						(answer !== undefined && answer !== null) || message !== ""  ? null :
						
							executionRunning ? null : 
								<div style={{marginBottom: 4}}>
									<Typography
										style={{
											fontSize: 12,
											fontWeight: 600,
											letterSpacing: "0.06em",
											textTransform: "uppercase",
											color: "hsl(var(--muted-foreground))",
											marginBottom: 8,
										}}
									>
										{foundSourcenode !== undefined && foundSourcenode !== null
											? "Add note"
											: "Runtime argument"}
									</Typography>

									<TextField
										disabled={executionRunning}
										color="primary"
										multiline
										minRows={4}
										maxRows={10}
										type="text"
										autoComplete="off"
										fullWidth
										placeholder="Paste JSON, text, or any value to pass into the workflow…"
										id="runtime-argument"
										variant="outlined"
										sx={{
											"& .MuiOutlinedInput-root": {
												backgroundColor: "hsl(var(--background) / 0.6)",
												borderRadius: "10px",
												fontSize: 14,
												lineHeight: 1.55,
												color: "hsl(var(--foreground))",
												padding: "12px 14px",
												transition: "border-color .15s ease, box-shadow .15s ease",
											},
											"& .MuiOutlinedInput-input::placeholder": {
												color: "hsl(var(--muted-foreground))",
												opacity: 1,
											},
											"& .MuiOutlinedInput-notchedOutline": {
												borderColor: "hsl(var(--border))",
											},
											"&:hover .MuiOutlinedInput-notchedOutline": {
												borderColor: "hsl(var(--border))",
											},
											"& .Mui-focused .MuiOutlinedInput-notchedOutline, & .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
												borderColor: "hsl(var(--primary))",
												borderWidth: "1px",
												boxShadow: "0 0 0 3px hsl(var(--primary) / 0.15)",
											},
										}}
										onChange={(e) => {
											setExecutionArgument(e.target.value)
										}}
										onKeyDown={(e) => {
											// Cmd/Ctrl+Enter submits the form even from
											// inside the multiline Runtime Argument field.
											if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
												e.preventDefault()
												if (handleValidateForm(executionArgument) && !executionLoading) {
													onSubmit(null)
												}
											}
										}}
									/>
									<Typography
										style={{
											marginTop: 8,
											fontSize: 12,
											color: "hsl(var(--muted-foreground))",
										}}
									>
										This value is forwarded to the workflow as the execution argument.
									</Typography>
								</div>
							
						}

						

						{executionRunning ?
							<span style={{width: 50, height: 50, margin: "auto", alignItems: "center", justifyContent: "center", textAlign: "center", }}>
								<CircularProgress style={{marginTop: 20, marginBottom: 20, marginLeft: 185, }}/>

								{/*executionData.status !== undefined && executionData.status !== null && executionData.status !== "" ?
									<Typography variant="body2" style={{margin: "auto", marginTop: 20, marginBottom: 20, textAlign: "center", alignItem: "center", }} color="textSecondary">
										Status: {executionData.status}
									</Typography>
								: null*/}
							</span>
							:
							(foundSourcenode !== undefined && foundSourcenode !== null) ? 
								<span style={{marginTop: 20, }}>

									{disabledButtons && message.length > 0 ?
										<Typography variant="body1"  style={{textAlign: "center", marginTop: 30, marginBottom: 20,  }}>
											{message}
										</Typography>
									: 
										<Fade in={true} timeout={2500}>
											<Typography variant="body1" style={{textAlign: "center", marginTop: 30, marginBottom: 20, }}>
												{disabledButtons ? "Question answered. You may close this window." : ""}
											</Typography>
										</Fade>
									}

									{disabledButtons ? null :
										answer === "false" ?
											<Typography variant="body2" color="textSecondary" style={{textAlign: "center", marginTop: 10, }}>
												Why are you declining?
											</Typography>
										:
											<Typography variant="body2" color="textSecondary" style={{textAlign: "center", marginTop: 10, }}>
												What do you want to do?
											</Typography>
									}

									{answer === "false" ?
										<div style={{width: "100%", marginTop: 10, marginBottom: 10, }}>
											<TextField
												fullWidth
												multiline
												minRows={3}
												maxRows={6}
												variant="outlined"
												placeholder="Provide a reason for declining (optional)"
												value={executionArgument || ""}
												onChange={(e) => {
													setExecutionArgument(e.target.value)
												}}
												onKeyDown={(e) => {
													if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
														e.preventDefault()
														if (!disabledButtons) {
															onSubmit(null, execution_id, authorization, false)
														}
													}
												}}
												style={{marginBottom: 10, }}
											/>
											<Button
												fullWidth
												id="abort_execution"
												variant="contained"
												disabled={disabledButtons}
												color="primary"
												style={{textTransform: "none", }}
												onClick={() => {
													setTimeout(() => {
														setButtonClicked("ABORTED")
														setExecutionData({
															status: "ABORTED",
														})
													}, 2500)

													onSubmit(null, execution_id, authorization, false)
												}}>
												Confirm Decline
											</Button>
										</div>
									:
										<div fullWidth style={{width: "100%", marginTop: 10, marginBottom: 10, display: "flex", }}>
											<Button
												fullWidth
												id="continue_execution"
												variant="contained"
												disabled={!handleValidateForm(executionArgument) || disabledButtons}
												color="primary"
												style={{
													flex: 1,
													textTransform: "none",
												}}
												onClick={() => {
													// Timeout 2500 just in case
													setTimeout(() => {
														setButtonClicked("FINISHED")
														setExecutionData({
															status: "FINISHED",
														})
													}, 2500)

													onSubmit(null, execution_id, authorization, true)
												}}>
												Continue</Button>
											<Typography variant="body1" style={{marginLeft: 3, marginRight: 3, marginTop: 3, }}>
												&nbsp;or&nbsp;
											</Typography>
											<Button
												fullWidth
												id="abort_execution"
												variant="outlined"
												disabled={!handleValidateForm(executionArgument) || disabledButtons}
												color="primary"
												style={{
													flex: 1,
													textTransform: "none",
												}} onClick={() => {
													setTimeout(() => {
														setButtonClicked("ABORTED")
														setExecutionData({
															status: "ABORTED",
														})
													}, 2500)

													onSubmit(null, execution_id, authorization, false)
											}}>
												Stop
											</Button>
										</div>
									}

									{answer !== "false" && handleValidateForm(executionArgument) === false && disabledButtons === false ?
										<Typography variant="body2" color="textSecondary" style={{textAlign: "center", marginTop: 10, underline: "1px solid grey", }}>
											All required questions have not been answered yet.
										</Typography>
									: null}
								</span>
							:
							<div style={{display: "flex", marginTop: 28}}>
								<Button 
									variant={executionData.result !== undefined && executionData.result !== null && executionData.result.length > 0 ? "outlined" : "contained"}
									type="submit" 
									color="primary" 
									fullWidth 
									disableElevation
									disabled={!handleValidateForm(executionArgument) || executionLoading}
									sx={{
										textTransform: "none",
										height: 44,
										borderRadius: "10px",
										fontWeight: 600,
										fontSize: 15,
										letterSpacing: "0.01em",
										backgroundColor: "hsl(var(--primary))",
										color: "hsl(var(--primary-foreground))",
										boxShadow: "0 6px 18px hsl(var(--primary) / 0.25)",
										transition: "transform .12s ease, box-shadow .12s ease, background-color .12s ease",
										"&:hover": {
											backgroundColor: "hsl(var(--primary) / 0.92)",
											boxShadow: "0 8px 22px hsl(var(--primary) / 0.32)",
											transform: "translateY(-1px)",
										},
										"&.Mui-disabled": {
											backgroundColor: "hsl(var(--muted))",
											color: "hsl(var(--muted-foreground))",
											boxShadow: "none",
										},
									}}
								>
									{executionLoading ? 
										<CircularProgress size={20} style={{color: "hsl(var(--primary-foreground))"}} /> 
									: executionData.result !== undefined && executionData.result !== null && executionData.result.length > 0 ? 
										"Run Again" 
									: executionData?.status === "WAITING" ? 
										"Submit answers"
									: "Run workflow"}
							</Button> 				
							</div>
						}


						{workflow.form_control.output_yields !== undefined && workflow.form_control.output_yields !== null && workflow.form_control.output_yields.length > 0 ?
							<div style={{marginTop: 20, }}>
								{workflow.form_control.output_yields.map((yieldItem, index) => {
									if (executionData.results === undefined || executionData.results === null || executionData.results.length === 0) {
										return null
									}

									const foundresult = executionData.results.find((result) => {
										return result.action.id === yieldItem
									})

									if (foundresult === undefined || foundresult === null) {
										return null
									}

									if (foundresult.status === "SKIPPED") {
										return null
									}

									const validate = validateJson(foundresult.result)
									validResults += 1
									var appendedDetails = foundresult.result
									if (validate.valid) { 
										appendedDetails = <ReactJson
											src={validate.result}
											theme={theme.palette.jsonTheme}
											style={theme.palette.reactJsonStyle}
											collapsed={false}
					    					shouldCollapse={(jsonField) => {
												return collapseField(jsonField)
											}}
											iconStyle={theme.palette.jsonIconStyle}
											collapseStringsAfterLength={theme.palette.jsonCollapseStringsAfterLength}
											displayArrayKey={false}
											enableClipboard={(copy) => {
											  //handleReactJsonClipboard(copy);
											}}
											displayDataTypes={false}
											onSelect={(select) => {
											  //HandleJsonCopy(validate.result, select, "exec");
											}}
											name={false}
										  />
									}

									return (
										<div style={{marginBottom: 10, borderBottom: "1px solid hsl(var(--border))", paddingBottom: 5, }} key={index}>
											{foundresult?.action?.label?.replaceAll("_", " ")} - {foundresult.status}:
											<br />

											{appendedDetails}
										</div>
									)
								})}
							</div>
						: null}

						<div style={{marginTop: "10px"}}>
							{executionInfo}
						</div>
	
						{answer !== undefined && answer !== null ? null :
							<ShowExecutionResults executionData={executionData} />
						}

						
					</form>
				</div>
				}
			</Paper>

			{workflowQuestion !== "" ? null : 
				<Typography variant="body2" color="textSecondary" align="center" style={{marginTop: 10, }} >
					Form submission data includes your Organization's unique ID, or a unique identifier for your browser. Your input will be automatically sanitized.
				</Typography>
			}
		</div>


    // const isCorrectOrg = userdata.active_org.id === undefined || userdata.active_org.id === null || workflow.org_id === null || workflow.org_id === undefined || workflow.org_id.length === 0 || userdata.active_org.id === workflow.org_id 
	const loadedCheck = isLoaded ? 
		<div style={{paddingTop: 60, }}>
			{editWorkflowModalOpen === true ?
			  <EditWorkflow
				saveWorkflow={saveWorkflow}
				workflow={workflow}
				setWorkflow={setWorkflow}
				modalOpen={editWorkflowModalOpen}
				setModalOpen={setEditWorkflowModalOpen}
				isEditing={true}
				userdata={userdata}
				usecases={undefined}

				expanded={true}
				setRealtimeMarkdown={setRealtimeMarkdown}
				setRealtimeInputQuestions={setInputQuestions}
				boxWidth={boxWidth}
				setBoxWidth={setBoxWidth}
				scrollTo={"form_fill"}
			  />
			: null}

			<Dialog
			  open={sharingOpen}
			  onClose={() => { setSharingOpen(false); }}
			  PaperProps={{
				sx: {
				  minWidth: isMobile ? "90%" : 520,
				  maxWidth: isMobile ? "90%" : 520,
				  bgcolor: "hsl(var(--card))",
				  color: "hsl(var(--foreground))",
				  border: "1px solid hsl(var(--border))",
				  borderRadius: 2,
				  boxShadow: "0 20px 60px -20px hsl(var(--background) / 0.6)",
				  p: 0,
				},
			  }}
			>
			  	<DialogTitle sx={{
					px: 3,
					pt: 2.5,
					pb: 1.5,
					fontSize: "1rem",
					fontWeight: 600,
					color: "hsl(var(--foreground))",
					borderBottom: "1px solid hsl(var(--border))",
				}}>
					Form sharing
					<Typography sx={{
						fontSize: "0.78rem",
						color: "hsl(var(--muted-foreground))",
						fontWeight: 400,
						mt: 0.5,
					}}>
						{workflow.name}
					</Typography>
			  	</DialogTitle>
        		<DialogContent sx={{ px: 3, pt: 2.5, pb: 3 }}>
					<Typography sx={{
						fontSize: "0.82rem",
						fontWeight: 600,
						color: "hsl(var(--foreground))",
						mb: 0.5,
					}}>
						General access
					</Typography>

					<Typography sx={{
						fontSize: "0.78rem",
						color: "hsl(var(--muted-foreground))",
						lineHeight: 1.5,
					}}>
						Form sharing and workflow sharing are not the same. By sharing a form,
						you are enabling anyone with the link to fill out the form and run the
						workflow. They will not have access to the workflow details. By default,
						anyone in the organization can use a form.
					</Typography>

					{workflow !== undefined && workflow !== null && workflow.sharing !== undefined && workflow.sharing !== null ?
						<Select
							fullWidth
							value={workflow.sharing === "" ? "private" : workflow.sharing}
							onChange={(e) => {
								workflow.sharing = e.target.value
								setWorkflow(workflow)
								saveWorkflow(workflow)
								setUpdate(Math.random())
								toast("Form sharing updated.")
							}}
							sx={{
								mt: 2.5,
								height: 38,
								color: "hsl(var(--foreground))",
								backgroundColor: "hsl(var(--background))",
								borderRadius: 1.25,
								fontSize: "0.85rem",
								"& .MuiOutlinedInput-notchedOutline": {
									borderColor: "hsl(var(--border))",
								},
								"&:hover .MuiOutlinedInput-notchedOutline": {
									borderColor: "hsl(var(--border))",
								},
							}}
						>
							<MenuItem value={"private"}>Organization only</MenuItem>
							<Divider />
							<MenuItem value={"form"}>Anyone with the link</MenuItem>
						</Select>
					: null}
				</DialogContent>
			</Dialog>

			{isLoggedIn && userdata?.active_org?.id === workflow?.org_id || userdata?.support === true ?
				<div style={{
					position: "fixed",
					top: 16,
					right: 20,
					display: "flex",
					alignItems: "center",
					gap: 8,
					zIndex: 1100,
				}}>
					{/* Ghost / outline action — visit the underlying workflow */}
					<Button
						disabled={workflow.id === undefined || workflow.id === null}
						onClick={async () => {
							if (workflow.id) {
								await navigateToShuffleCore(getShuffleCoreWorkflowUrl(workflow.id), { newTab: true });
							}
						}}
						sx={{
							height: 36,
							px: 1.75,
							gap: 0.75,
							textTransform: "none",
							fontSize: "0.82rem",
							fontWeight: 500,
							color: "hsl(var(--foreground))",
							backgroundColor: "transparent",
							border: "1px solid hsl(var(--border))",
							borderRadius: 1.25,
							boxShadow: "none",
							"&:hover": {
								backgroundColor: "hsl(var(--muted) / 0.5)",
								borderColor: "hsl(var(--border))",
							},
							"&.Mui-disabled": {
								color: "hsl(var(--muted-foreground))",
								borderColor: "hsl(var(--border))",
								opacity: 0.5,
							},
						}}
					>
						<OpenInNewIcon size={14} />
						Workflow
					</Button>

					{/* Neutral / secondary action — share toggle */}
					<Button
						disabled={workflow.id === undefined || workflow.id === null}
						onClick={() => { setSharingOpen(true) }}
						sx={{
							height: 36,
							px: 1.75,
							gap: 0.75,
							textTransform: "none",
							fontSize: "0.82rem",
							fontWeight: 500,
							color: "hsl(var(--foreground))",
							backgroundColor: "hsl(var(--muted))",
							border: "1px solid hsl(var(--border))",
							borderRadius: 1.25,
							boxShadow: "none",
							"&:hover": {
								backgroundColor: "hsl(var(--muted) / 0.75)",
								boxShadow: "none",
							},
							"&.Mui-disabled": {
								color: "hsl(var(--muted-foreground))",
								backgroundColor: "hsl(var(--muted) / 0.4)",
								borderColor: "hsl(var(--border))",
								opacity: 0.6,
							},
						}}
					>
						{workflow.sharing === "form"
							? <LockOpenIcon size={14} />
							: <LockIcon size={14} />}
						{workflow.sharing === "form" ? "Unshare" : "Share"}
					</Button>

					{/* Primary action — orange brand button */}
					<Button
						disabled={workflow.id === undefined || workflow.id === null}
						onClick={() => { setEditWorkflowModalOpen(true) }}
						sx={{
							height: 36,
							px: 1.75,
							gap: 0.75,
							textTransform: "none",
							fontSize: "0.82rem",
							fontWeight: 600,
							color: "hsl(var(--primary-foreground))",
							backgroundColor: "hsl(var(--primary))",
							border: "1px solid hsl(var(--primary))",
							borderRadius: 1.25,
							boxShadow: "none",
							"&:hover": {
								backgroundColor: "hsl(var(--primary) / 0.9)",
								boxShadow: "none",
							},
							"&.Mui-disabled": {
								color: "hsl(var(--primary-foreground))",
								backgroundColor: "hsl(var(--primary) / 0.4)",
								borderColor: "transparent",
							},
						}}
					>
						<EditIcon size={14} />
						Edit Form
					</Button>
				</div>
			: null}

      		{basedata}
		</div>
		:
		<div style={{width: 100, itemAlign: "center", textAlign: "center", margin: "auto", }}>
			<CircularProgress />
		</div>

	// Check width
	const overlap = typeof window !== "undefined" && window.innerWidth !== undefined && window.innerWidth < 1300 

	const formSidebar = !isLoaded || overlap || !(forms !== undefined && forms !== null && forms.length > 0) ? null :
		<div style={{
			width: 240,
			overflowX: "hidden",
			overflowY: "auto",
			maxHeight: "calc(100vh - 140px)",
			position: "fixed",
			right: `calc(50% + ${boxWidth / 2}px + 24px)`,
			top: 100,
			border: "1px solid hsl(var(--border))",
			borderRadius: 12,
			padding: 12,
			backgroundColor: "hsl(var(--card))",
			zIndex: 1000,
		}}>
			{selectedOrganization !== undefined && selectedOrganization !== null ?
				<div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid hsl(var(--border))"}}>
					<img src={selectedOrganization.image} style={{width: 24, height: 24, borderRadius: 6}} />
					<Typography variant="body2" style={{fontWeight: 600, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
						{selectedOrganization.name}
					</Typography>
				</div>
			: null}

			<Typography variant="caption" style={{display: "block", color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, fontWeight: 600, marginBottom: 6, paddingLeft: 4}}>
				Available forms
			</Typography>

			{forms !== undefined && forms !== null && forms.length > 0 ?
				<div style={{display: "flex", flexDirection: "column", gap: 2}}>
					<FormList />
				</div>
			:
				<Typography variant="body2" style={{color: "hsl(var(--muted-foreground))", padding: 4}}>
					No forms loaded
				</Typography>
			}
		</div>


	return (
		<div style={{position: "relative", }}>
			{loadedCheck}
			{formSidebar}
		</div>
	)
}

export default FormInput
