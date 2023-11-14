import React from "react";
import { Link } from 'react-router-dom';

const Navbar= ()=>{
    return(
        <nav className="navbar">
            <ul>
                <li><Link to="/">صقحه اصلی</Link></li>
                <li><Link to="/Project">پروژه های ما</Link></li>
                <li><Link to="/ContactUS">تماس با ما</Link></li>
            </ul>
        </nav>
        )
}
export default Navbar;