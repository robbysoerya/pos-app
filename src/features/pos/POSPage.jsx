import POSLeft from './components/POSLeft.jsx'
import POSRight from './components/POSRight.jsx'
import './POSPage.css'

export default function POSPage() {
    return (
        <div className="pos-layout">
            <POSLeft />
            <POSRight />
        </div>
    )
}
