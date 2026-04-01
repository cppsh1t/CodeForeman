import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="absolute bottom-[30px] mx-auto inline-flex overflow-hidden items-center rounded-[22px] bg-[#202127] px-5 py-[15px] font-['Menlo','Lucida_Console',monospace] text-sm leading-[14px] opacity-80 max-w-[620px]:hidden">
      <li className="border-r border-ev-gray-1 px-5 first-of-type:">
        Electron v{versions.electron}
      </li>
      <li className="border-r border-ev-gray-1 px-5">Chromium v{versions.chrome}</li>
      <li className="px-5">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
