import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

// Domain contract consumability (Task 1): proves shared types resolve in renderer web context
export type { ProjectStatus, TaskStatus, PlanStatus, ErrorCode, CorrelationId } from '@shared/types'

function App(): React.JSX.Element {
  const ipcHandle = (): void => {
    window.api.projectList({}).then((res) => {
      if (res.ok) console.log('projects:', res.data)
      else console.error('ipc error:', res.error)
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden select-none bg-background">
      <div className="flex flex-col items-center justify-center mb-20">
        <img
          alt="logo"
          className="mb-5 h-32 w-32 will-change-[filter] transition-[filter] duration-300 hover:drop-shadow-[0_0_1.2em_#6988e6aa]"
          src={electronLogo}
          style={{ WebkitUserDrag: 'none' } as React.CSSProperties}
        />
        <p className="mb-2.5 text-sm leading-4 font-semibold text-content-dim">
          Powered by electron-vite
        </p>
        <p className="mx-2.5 max-w-[720px]:text-xl rounded px-4 py-4 text-center text-[28px] leading-8 font-bold text-content">
          Build an Electron app with{' '}
          <span className="font-bold bg-linear-to-tr from-[#087ea4] to-[#7c93ee] bg-clip-text text-transparent">
            React
          </span>
          &nbsp;and{' '}
          <span className="font-bold bg-linear-to-tr from-[#3178c6] to-[#f0dc4e] bg-clip-text text-transparent">
            TypeScript
          </span>
        </p>
        <p className="text-base leading-6 font-semibold text-content-dim">
          Please try pressing <code>F12</code> to open the devTool
        </p>
        <div className="-m-1.5 flex flex-wrap justify-start pt-8">
          <div className="shrink-0 p-1.5">
            <a
              className="inline-block cursor-pointer whitespace-nowrap rounded-full border border-transparent px-5 text-center text-sm font-semibold leading-[38px] bg-ev-button-alt-bg text-content hover:bg-ev-button-alt-hover-bg"
              href="https://electron-vite.org/"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              Documentation
            </a>
          </div>
          <div className="shrink-0 p-1.5">
            <a
              className="inline-block cursor-pointer whitespace-nowrap rounded-full border border-transparent px-5 text-center text-sm font-semibold leading-[38px] bg-ev-button-alt-bg text-content hover:bg-ev-button-alt-hover-bg"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
              target="_blank"
              onClick={ipcHandle}
            >
              Send IPC
            </a>
          </div>
        </div>
        <Versions />
      </div>
    </div>
  )
}

export default App
